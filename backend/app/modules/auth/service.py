import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.auth.models import Permission, Role
from app.modules.auth.repository import PermissionRepository, RoleRepository
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    PermissionCreate,
    PermissionUpdate,
    RegisterRequest,
    ResetPasswordRequest,
    RoleCreate,
    RoleUpdate,
    TokenResponse,
    TokenUserInfo,
)
from app.modules.tenants import service as tenants_service
from app.modules.users import service as users_service
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

log = get_logger("auth")


async def get_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> Role:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    return role


async def get_role_by_name(db: AsyncSession, tenant_id: uuid.UUID, name: str) -> Role | None:
    return await RoleRepository(db).get_by_name_for_tenant(tenant_id, name)


async def create_role(db: AsyncSession, tenant_id: uuid.UUID, data: RoleCreate) -> Role:
    existing = await get_role_by_name(db, tenant_id, data.name)
    if existing:
        raise ConflictError("Role with this name already exists")
    role = Role(tenant_id=tenant_id, name=data.name, description=data.description)
    return await RoleRepository(db).save(role)


async def list_roles(db: AsyncSession, tenant_id: uuid.UUID, offset: int, limit: int) -> list[Role]:
    return await RoleRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_roles(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await RoleRepository(db).count_for_tenant(tenant_id)


async def update_role(db: AsyncSession, role: Role, data: RoleUpdate) -> Role:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    return await RoleRepository(db).save(role)


async def delete_role(db: AsyncSession, role: Role) -> None:
    await RoleRepository(db).delete(role)


async def get_permission(db: AsyncSession, permission_id: uuid.UUID) -> Permission:
    perm = await PermissionRepository(db).get(permission_id)
    if perm is None:
        raise NotFoundError("Permission not found")
    return perm


async def get_permission_by_name(db: AsyncSession, name: str) -> Permission | None:
    return await PermissionRepository(db).get_by_name(name)


async def create_permission(db: AsyncSession, data: PermissionCreate) -> Permission:
    existing = await get_permission_by_name(db, data.name)
    if existing:
        raise ConflictError("Permission with this name already exists")
    perm = Permission(name=data.name, description=data.description, resource=data.resource, action=data.action)
    return await PermissionRepository(db).save(perm)


async def list_permissions(db: AsyncSession, offset: int = 0, limit: int = 100) -> list[Permission]:
    return await PermissionRepository(db).list_all(offset, limit)


async def count_permissions(db: AsyncSession) -> int:
    return await PermissionRepository(db).count_all()


async def update_permission(db: AsyncSession, perm: Permission, data: PermissionUpdate) -> Permission:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(perm, field, value)
    return await PermissionRepository(db).save(perm)


async def delete_permission(db: AsyncSession, perm: Permission) -> None:
    await PermissionRepository(db).delete(perm)


async def assign_perm_to_role(db: AsyncSession, role_id: uuid.UUID, permission_ids: list[uuid.UUID]) -> None:
    for pid in permission_ids:
        await get_permission(db, pid)
    await PermissionRepository(db).assign_permissions_to_role(role_id, permission_ids)


async def get_role_permissions(db: AsyncSession, role_id: uuid.UUID) -> list[Permission]:
    return await PermissionRepository(db).get_permissions_for_role(role_id)


async def get_user_permissions(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> list[Permission]:
    return await PermissionRepository(db).get_permissions_for_user(tenant_id, role_id)


def _build_user_info(user: User, permission_names: list[str] | None = None) -> TokenUserInfo:
    return TokenUserInfo(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        role_id=user.role_id,
        is_superuser=user.is_superuser,
        tenant_id=user.tenant_id,
        tenant_name=user.tenant.name if user.tenant else "",
        tenant_slug=user.tenant.slug if user.tenant else "",
        permissions=permission_names or [],
    )


def _build_token_claims(user: User, permission_names: list[str] | None = None) -> dict:
    return {
        "tenant_id": str(user.tenant_id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "role_id": str(user.role_id) if user.role_id else None,
        "is_superuser": user.is_superuser,
        "permissions": permission_names or [],
    }


def _get_permission_names(user: User) -> list[str]:
    if user.role_rel and user.role_rel.permissions:
        return [p.name for p in user.role_rel.permissions]
    return []


def _issue_tokens(user: User) -> TokenResponse:
    permission_names = _get_permission_names(user)
    claims = _build_token_claims(user, permission_names)
    user_info = _build_user_info(user, permission_names)

    return TokenResponse(
        access_token=create_access_token(str(user.id), claims),
        refresh_token=create_refresh_token(str(user.id), {"tenant_id": str(user.tenant_id)}),
        user=user_info,
    )


async def register(db: AsyncSession, data: RegisterRequest) -> TokenResponse:
    log.info("auth.register.attempt", extra={"_extra_fields": {"email": data.email, "tenant_slug": data.tenant_slug}})

    if await tenants_service.get_by_slug(db, data.tenant_slug) is not None:
        log.warning("auth.register.conflict", extra={"_extra_fields": {"tenant_slug": data.tenant_slug}})
        raise ConflictError("Tenant slug already taken")

    tenant = await tenants_service.create(db, data.tenant_name, data.tenant_slug)

    user = User(
        tenant_id=tenant.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role="owner",
        is_superuser=True,
    )
    user = await UserRepository(db).save(user)

    log.info("auth.register.success", extra={"_extra_fields": {"user_id": str(user.id), "tenant_id": str(tenant.id)}})
    return _issue_tokens(user)


async def login(db: AsyncSession, data: LoginRequest) -> TokenResponse:
    log.info("auth.login.attempt", extra={"_extra_fields": {"email": data.email, "tenant_slug": data.tenant_slug}})

    tenant = await tenants_service.get_by_slug(db, data.tenant_slug)
    if tenant is None:
        log.warning("auth.login.invalid_tenant", extra={"_extra_fields": {"tenant_slug": data.tenant_slug}})
        raise UnauthorizedError("Invalid credentials")

    user = await users_service.get_by_email(db, tenant.id, data.email)
    if user is None or not verify_password(data.password, user.hashed_password):
        log.warning("auth.login.invalid_credentials", extra={"_extra_fields": {"email": data.email}})
        raise UnauthorizedError("Invalid credentials")
    if not user.is_active:
        log.warning("auth.login.inactive_user", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise UnauthorizedError("User is inactive")

    log.info("auth.login.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return _issue_tokens(user)


async def refresh(db: AsyncSession, refresh_token: str) -> TokenResponse:
    log.info("auth.refresh.attempt")

    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        log.warning("auth.refresh.invalid_token")
        raise UnauthorizedError("Invalid or expired refresh token")

    user_id = uuid.UUID(payload["sub"])
    tenant_id = payload.get("tenant_id")

    if tenant_id:
        user = await users_service.get_by_id(db, uuid.UUID(tenant_id), user_id)
    else:
        user = await UserRepository(db).get(user_id)

    if user is None or not user.is_active:
        log.warning("auth.refresh.invalid_user", extra={"_extra_fields": {"user_id": str(user_id)}})
        raise UnauthorizedError("Invalid refresh token")

    log.info("auth.refresh.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return _issue_tokens(user)


async def forgot_password(db: AsyncSession, data: ForgotPasswordRequest) -> dict:
    log.info("auth.forgot_password.attempt", extra={"_extra_fields": {"email": data.email, "tenant_slug": data.tenant_slug}})

    tenant = await tenants_service.get_by_slug(db, data.tenant_slug)
    if tenant is None:
        return {"message": "If the email exists, a password reset link has been sent"}

    user = await users_service.get_by_email(db, tenant.id, data.email)
    if user is None:
        return {"message": "If the email exists, a password reset link has been sent"}

    reset_token = create_password_reset_token(
        str(user.id),
        {"tenant_id": str(user.tenant_id), "email": user.email},
    )

    log.info("auth.forgot_password.token_generated", extra={"_extra_fields": {"user_id": str(user.id)}})
    return {
        "message": "If the email exists, a password reset link has been sent",
        "reset_token": reset_token,
    }


async def reset_password(db: AsyncSession, data: ResetPasswordRequest) -> None:
    log.info("auth.reset_password.attempt")

    payload = decode_token(data.token)
    if payload is None or payload.get("type") != "password_reset":
        log.warning("auth.reset_password.invalid_token")
        raise UnauthorizedError("Invalid or expired reset token")

    user_id = uuid.UUID(payload["sub"])
    tenant_id = uuid.UUID(payload["tenant_id"])

    user = await users_service.get_by_id(db, tenant_id, user_id)
    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)

    log.info("auth.reset_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})


async def change_password(db: AsyncSession, user: User, data) -> None:
    log.info("auth.change_password.attempt", extra={"_extra_fields": {"user_id": str(user.id)}})

    if not verify_password(data.current_password, user.hashed_password):
        log.warning("auth.change_password.wrong_password", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise UnauthorizedError("Current password is incorrect")

    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)

    log.info("auth.change_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})
