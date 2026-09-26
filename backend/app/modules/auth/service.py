import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import (
    send_password_reset_email,
    send_pending_signup_email,
    send_registration_received_email,
)
from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError, ValidationError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.modules.audit.service import record_audit
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    TokenResponse,
    TokenUserInfo,
)
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import TenantRepository, UserRepository

log = get_logger("auth")

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


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
        "permissions": _get_permission_names(user),
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


async def register(db: AsyncSession, data: RegisterRequest) -> RegisterResponse:
    log.info("auth.register.attempt", extra={"_extra_fields": {"email": data.email, "tenant_slug": data.tenant_slug}})

    if not data.tenant_name.strip():
        raise ValidationError("Business name is required")
    if not data.full_name.strip():
        raise ValidationError("Full name is required")
    if not SLUG_RE.match(data.tenant_slug):
        raise ValidationError("Business URL must be lowercase letters, numbers, and hyphens only")
    validate_password_strength(data.password)

    existing_tenant = await TenantRepository(db).get_by_slug(data.tenant_slug)
    if existing_tenant is not None:
        log.warning("auth.register.conflict", extra={"_extra_fields": {"tenant_slug": data.tenant_slug}})
        raise ConflictError("Tenant slug already taken")

    existing_user = await UserRepository(db).get_by_email_global(data.email)
    if existing_user is not None:
        log.warning("auth.register.email_conflict", extra={"_extra_fields": {"email": data.email}})
        raise ConflictError("Email already registered")

    # New signups land inactive — a platform superadmin must approve them
    # (POST /admin/tenants/{id}/activate) before anyone can log in. This is
    # the same is_active flag suspend/activate already uses, so an unapproved
    # signup and a suspended tenant are both blocked identically at login.
    tenant = Tenant(
        name=data.tenant_name,
        slug=data.tenant_slug,
        is_active=False,
        subscription_status="pending",
        country=data.country,
        business_type=data.business_type,
        industry=data.industry,
        business_category=data.business_category,
        employee_count=data.employee_count,
        business_location=data.business_location,
        heard_about=data.heard_about,
        referral_code=data.referral_code,
    )
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

    from app.modules.tenants.service.department import seed_default_departments
    from app.modules.tenants.service.role import seed_default_roles

    await seed_default_departments(db, tenant.id)
    # Without this, every user invited after the owner gets role_id=None and
    # zero permissions — see resolve_role_id, which invite flows use to turn
    # an invite's role string into real access against these seeded roles.
    await seed_default_roles(db, tenant.id)
    await db.commit()

    log.info("auth.register.pending", extra={"_extra_fields": {"user_id": str(user.id), "tenant_id": str(tenant.id)}})

    await send_registration_received_email(to=user.email, full_name=user.full_name, tenant_name=tenant.name)

    # role == "superadmin" specifically — not just tenant_id is None +
    # is_superuser, which an orphaned ex-tenant-owner could also match
    # (see Tenant cascade-delete fix in tenants/service.py).
    superadmins = (await db.execute(
        select(User).where(User.tenant_id.is_(None), User.role == "superadmin")
    )).scalars().all()
    for admin in superadmins:
        await send_pending_signup_email(
            to=admin.email,
            tenant_name=tenant.name,
            tenant_slug=tenant.slug,
            review_url=f"{settings.FRONTEND_URL}/admin/tenants/{tenant.id}",
        )

    return RegisterResponse(pending_approval=True, tenant_slug=tenant.slug)


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
    if user.tenant is not None and not user.tenant.is_active:
        log.warning("auth.login.suspended_tenant", extra={"_extra_fields": {"user_id": str(user.id), "tenant_id": str(user.tenant_id)}})
        raise UnauthorizedError("This account has been suspended")

    log.info("auth.login.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    await record_audit(
        db,
        tenant_id=user.tenant_id,
        actor_user_id=user.id,
        actor_name=user.full_name or user.email,
        action="login",
        entity_type="user",
        entity_id=str(user.id),
        summary="User signed in",
    )
    await db.commit()
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

    reset_token = create_password_reset_token(
        str(user.id),
        {"tenant_id": str(user.tenant_id) if user.tenant_id else ""},
    )
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    delivered = await send_password_reset_email(
        to=user.email,
        full_name=user.full_name,
        reset_link=reset_link,
    )

    log.info("auth.forgot_password.token_generated", extra={"_extra_fields": {"user_id": str(user.id), "delivered": delivered}})

    # Public response is identical whether or not the account exists (no
    # account-enumeration oracle). Locally/staging the email infra may be
    # unconfigured, so surface the link + delivery status there to keep the
    # flow testable — never in production.
    result = {"message": "If the email exists, a password reset link has been sent"}
    if not settings.is_production:
        result["debug_reset_link"] = reset_link
        result["debug_email_delivered"] = delivered
    return result


async def reset_password(db: AsyncSession, data: ResetPasswordRequest) -> None:
    log.info("auth.reset_password.attempt")

    validate_password_strength(data.new_password)

    payload = decode_token(data.token)
    if payload is None or payload.get("type") != "password_reset":
        log.warning("auth.reset_password.invalid_token")
        raise UnauthorizedError("Invalid or expired reset token")

    user_id = uuid.UUID(payload["sub"])
    tenant_id_str = payload.get("tenant_id") or ""

    if tenant_id_str:
        tenant_id = uuid.UUID(tenant_id_str)
        user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    else:
        user = await UserRepository(db).get(user_id)
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
    validate_password_strength(data.new_password)

    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)
    await db.commit()

    log.info("auth.change_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})
