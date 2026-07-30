import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TokenUserInfo,
)
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import TenantRepository, UserRepository

log = get_logger("auth")


def _build_user_info(user: User, permission_names: list[str] | None = None) -> TokenUserInfo:
    return TokenUserInfo(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        role_id=user.role_id,
        is_superuser=user.is_superuser,
        tenant_id=user.tenant_id,
        tenant_name=user.tenant.name if user.tenant else None,
        tenant_slug=user.tenant.slug if user.tenant else None,
        permissions=permission_names or [],
    )


def _build_token_claims(user: User) -> dict:
    return {
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "role_id": str(user.role_id) if user.role_id else None,
        "is_superuser": user.is_superuser,
    }


def _get_permission_names(user: User) -> list[str]:
    if user.role_rel and user.role_rel.permissions:
        return [p.name for p in user.role_rel.permissions]
    return []


def _issue_tokens(user: User) -> TokenResponse:
    permission_names = _get_permission_names(user)
    claims = _build_token_claims(user)
    user_info = _build_user_info(user, permission_names)

    refresh_claims = {}
    if user.tenant_id:
        refresh_claims["tenant_id"] = str(user.tenant_id)

    return TokenResponse(
        access_token=create_access_token(str(user.id), claims),
        refresh_token=create_refresh_token(str(user.id), refresh_claims),
        user=user_info,
    )


async def register(db: AsyncSession, data: RegisterRequest) -> TokenResponse:
    log.info("auth.register.attempt", extra={"_extra_fields": {"email": data.email, "tenant_slug": data.tenant_slug}})

    existing_tenant = await TenantRepository(db).get_by_slug(data.tenant_slug)
    if existing_tenant is not None:
        log.warning("auth.register.conflict", extra={"_extra_fields": {"tenant_slug": data.tenant_slug}})
        raise ConflictError("Tenant slug already taken")

    existing_user = await UserRepository(db).get_by_email_global(data.email)
    if existing_user is not None:
        log.warning("auth.register.email_conflict", extra={"_extra_fields": {"email": data.email}})
        raise ConflictError("Email already registered")

    tenant = Tenant(name=data.tenant_name, slug=data.tenant_slug)
    tenant = await TenantRepository(db).save(tenant)

    user = User(
        tenant_id=tenant.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role="owner",
        is_superuser=True,
    )
    user = await UserRepository(db).save(user)

    await db.commit()

    log.info("auth.register.success", extra={"_extra_fields": {"user_id": str(user.id), "tenant_id": str(tenant.id)}})
    return _issue_tokens(user)


async def login(db: AsyncSession, data: LoginRequest) -> TokenResponse:
    log.info("auth.login.attempt", extra={"_extra_fields": {"email": data.email}})

    if data.tenant_slug:
        tenant = await TenantRepository(db).get_by_slug(data.tenant_slug)
        if tenant is None:
            log.warning("auth.login.invalid_tenant", extra={"_extra_fields": {"tenant_slug": data.tenant_slug}})
            raise UnauthorizedError("Invalid credentials")
        user = await UserRepository(db).get_by_email(tenant.id, data.email)
    else:
        user = await UserRepository(db).get_by_email_global(data.email)

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
        user = await UserRepository(db).get_by_id_for_tenant(uuid.UUID(tenant_id), user_id)
    else:
        user = await UserRepository(db).get(user_id)

    if user is None or not user.is_active:
        log.warning("auth.refresh.invalid_user", extra={"_extra_fields": {"user_id": str(user_id)}})
        raise UnauthorizedError("Invalid refresh token")

    log.info("auth.refresh.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return _issue_tokens(user)


async def forgot_password(db: AsyncSession, data: ForgotPasswordRequest) -> dict:
    log.info("auth.forgot_password.attempt", extra={"_extra_fields": {"email": data.email}})

    user = await UserRepository(db).get_by_email_global(data.email)
    if user is None:
        return {"message": "If the email exists, a password reset link has been sent"}

    log.info("auth.forgot_password.token_generated", extra={"_extra_fields": {"user_id": str(user.id)}})
    return {"message": "If the email exists, a password reset link has been sent"}


async def reset_password(db: AsyncSession, data: ResetPasswordRequest) -> None:
    log.info("auth.reset_password.attempt")

    payload = decode_token(data.token)
    if payload is None or payload.get("type") != "password_reset":
        log.warning("auth.reset_password.invalid_token")
        raise UnauthorizedError("Invalid or expired reset token")

    user_id = uuid.UUID(payload["sub"])
    tenant_id = uuid.UUID(payload["tenant_id"])

    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found")
    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)
    await db.commit()

    log.info("auth.reset_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})


async def change_password(db: AsyncSession, user: User, data) -> None:
    log.info("auth.change_password.attempt", extra={"_extra_fields": {"user_id": str(user.id)}})

    if not verify_password(data.current_password, user.hashed_password):
        log.warning("auth.change_password.wrong_password", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise UnauthorizedError("Current password is incorrect")

    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)
    await db.commit()

    log.info("auth.change_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})
