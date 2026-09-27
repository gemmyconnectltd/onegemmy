import secrets
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_invite_email, send_temp_password_email
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.security import hash_password, validate_password_strength, verify_password
from app.modules.audit.schemas import AuditLogRead
from app.modules.audit.service import count_user_activity, list_user_activity, record_audit
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import RoleRepository, UserRepository
from app.modules.tenants.schemas import (
    ChangePasswordRequest,
    MyProfileUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)

log = get_logger("users")


async def get_user_by_id(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> UserRead:
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        log.warning("users.get_by_id.not_found", extra={"_extra_fields": {"user_id": str(user_id), "tenant_id": str(tenant_id)}})
        raise NotFoundError("User not found")
    return user_to_read(user)


async def get_user_by_id_raw(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
    return await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)


async def get_user_by_id_global(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await UserRepository(db).get(user_id)


async def get_user_by_email(db: AsyncSession, tenant_id: uuid.UUID, email: str) -> User | None:
    return await UserRepository(db).get_by_email(tenant_id, email)


async def get_user_by_email_global(db: AsyncSession, email: str) -> User | None:
    return await UserRepository(db).get_by_email_global(email)


async def list_users(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int,
    limit: int,
    search: str | None = None,
    is_active: bool | None = None,
    role_id: uuid.UUID | None = None,
) -> list[UserRead]:
    users = await UserRepository(db).list_for_tenant(tenant_id, offset, limit, search, is_active, role_id)
    return [user_to_read(u) for u in users]


async def count_users(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    search: str | None = None,
    is_active: bool | None = None,
    role_id: uuid.UUID | None = None,
) -> int:
    return await UserRepository(db).count_for_tenant(tenant_id, search, is_active, role_id)


async def create_user(
    db: AsyncSession, tenant_id: uuid.UUID, data: UserCreate, actor: User | None = None
) -> UserRead:
    log.info("users.create.attempt", extra={"_extra_fields": {"email": data.email, "tenant_id": str(tenant_id)}})

    existing = await get_user_by_email_global(db, data.email)
    if existing:
        log.warning("users.create.conflict", extra={"_extra_fields": {"email": data.email}})
        raise ConflictError("User with this email already exists")

    from app.modules.tenants import service

    await service.enforce_limit(db, tenant_id, "max_users", await count_users(db, tenant_id), noun="user")

    # Never trust a password an inviter typed for someone else — generate a
    # strong random temporary one server-side and email it instead.
    temp_password = secrets.token_urlsafe(12)

    # A caller can pass an explicit role_id (picking a real Role); if it
    # didn't, fall back to resolving the free-text role string so the user
    # never ends up with role_id=None -> zero permissions. Either way the
    # role is validated against this tenant so nobody can grant a role that
    # belongs to another company.
    role = await _resolve_role(db, tenant_id, data.role_id, data.role)
    if role is None:
        raise ValidationError(
            f"Unknown role '{data.role}'. Create the role first, or pick one of the tenant's existing roles."
        )

    user = User(
        tenant_id=tenant_id,
        email=data.email,
        hashed_password=hash_password(temp_password),
        full_name=data.full_name,
        phone=data.phone or None,
        role=role.name.lower(),
        role_id=role.id,
        branch_id=data.branch_id,
        department_id=data.department_id,
    )
    user = await UserRepository(db).save(user)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_name=(actor.full_name or actor.email) if actor else None,
        action="user.create",
        entity_type="user",
        entity_id=str(user.id),
        summary=f"User '{user.email}' added to the company",
        changes={"full_name": user.full_name, "role": user.role, "phone": user.phone},
    )
    await db.commit()
    log.info("users.create.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    tenant = await db.get(Tenant, tenant_id)
    await send_invite_email(
        to=user.email,
        full_name=user.full_name,
        tenant_name=tenant.name if tenant else str(tenant_id),
        temp_password=temp_password,
    )
    return user_to_read(user)


async def update_user(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UserUpdate,
    actor: User | None = None,
) -> UserRead:
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found")
    payload = data.model_dump(exclude_unset=True)
    fields = list(payload.keys())
    log.info("users.update.attempt", extra={"_extra_fields": {"user_id": str(user.id), "fields": fields}})

    # --- guard rails, applied before anything is written -----------------
    before = {"role": user.role, "is_active": user.is_active, "phone": user.phone}
    role_change_requested = "role" in payload or "role_id" in payload
    deactivating = payload.get("is_active") is False and user.is_active

    if deactivating:
        await _assert_not_last_admin(db, tenant_id, user, "deactivated")
    # Anyone may switch their own active flag off (that's just signing out of
    # everyone's view), but nobody may flip their own flag back on — that
    # would be a reactivation an admin never approved.
    if (
        actor is not None
        and actor.id == user.id
        and "is_active" in payload
        and payload["is_active"] is not False
        and user.is_active is False
    ):
        raise ForbiddenError("A deactivated user cannot reactivate their own account")

    if role_change_requested:
        role = await _resolve_role(
            db,
            tenant_id,
            payload.get("role_id"),
            payload.get("role") or user.role,
        )
        if role is None:
            raise ValidationError("Unknown role — pick one of this company's existing roles.")
        losing_admin = _is_admin(user) and not _role_is_admin(role)
        if losing_admin:
            await _assert_not_last_admin(db, tenant_id, user, "demoted")
        user.role_id = role.id
        user.role = role.name.lower()

    for field, value in payload.items():
        if field in {"role", "role_id", "is_active"}:
            continue  # already handled above
        if field == "phone":
            continue  # normalised below
        setattr(user, field, value)
    if "phone" in payload:
        user.phone = (payload["phone"] or "").strip() or None

    user = await UserRepository(db).save(user)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_name=(actor.full_name or actor.email) if actor else None,
        action="user.update",
        entity_type="user",
        entity_id=str(user.id),
        summary=_update_summary(user, before, payload),
        changes={"updated": fields, "previous": before},
    )
    await db.commit()
    log.info("users.update.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return user_to_read(user)


async def update_my_profile(
    db: AsyncSession, user: User, data: MyProfileUpdate
) -> UserRead:
    """Self-service edit of one's own name and phone. Not permission-gated:
    every signed-in user must be able to correct their own details, and the
    schema keeps admin-only fields (role, status, email) out of reach."""
    payload = data.model_dump(exclude_unset=True)
    if payload.get("full_name"):
        user.full_name = payload["full_name"].strip()
    if "phone" in payload:
        user.phone = (payload["phone"] or "").strip() or None
    await UserRepository(db).save(user)
    await record_audit(
        db,
        tenant_id=user.tenant_id,
        actor_user_id=user.id,
        actor_name=user.full_name or user.email,
        action="user.profile_update",
        entity_type="user",
        entity_id=str(user.id),
        summary="Updated own profile details",
        changes={"updated": list(payload.keys())},
    )
    await db.commit()
    log.info("users.update_my_profile.success", extra={"_extra_fields": {"user_id": str(user.id)}})
    return user_to_read(user)


async def set_user_active(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    is_active: bool,
    actor: User | None = None,
) -> UserRead:
    """Activate / deactivate, as its own endpoint so the audit trail records
    a readable "user.deactivate" rather than a generic update."""
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found")
    if user.is_active == is_active:
        return user_to_read(user)
    if not is_active:
        await _assert_not_last_admin(db, tenant_id, user, "deactivated")
        if actor is not None and actor.id == user.id:
            raise ValidationError("You cannot deactivate your own account")

    user.is_active = is_active
    user = await UserRepository(db).save(user)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_name=(actor.full_name or actor.email) if actor else None,
        action="user.activate" if is_active else "user.deactivate",
        entity_type="user",
        entity_id=str(user.id),
        summary=(
            f"User '{user.email}' {'reactivated' if is_active else 'deactivated'}"
        ),
    )
    await db.commit()
    log.info("users.set_active.success", extra={"_extra_fields": {"user_id": str(user.id), "is_active": is_active}})
    return user_to_read(user)


async def delete_user(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, actor: User | None = None
) -> None:
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found")
    if user.is_superuser:
        raise ConflictError("A platform superuser cannot be removed from a company")
    if _is_admin(user):
        await _assert_not_last_admin(db, tenant_id, user, "removed")
    if actor is not None and actor.id == user.id:
        raise ValidationError("You cannot remove your own account")
    log.info("users.delete.attempt", extra={"_extra_fields": {"user_id": str(user.id), "email": user.email}})
    # Recorded before the delete: the FK is ON DELETE SET NULL, so writing it
    # afterwards would lose the trail entirely.
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_name=(actor.full_name or actor.email) if actor else None,
        action="user.delete",
        entity_type="user",
        entity_id=str(user.id),
        summary=f"User '{user.email}' removed from the company",
    )
    await UserRepository(db).delete(user)
    await db.commit()
    log.info("users.delete.success", extra={"_extra_fields": {"user_id": str(user.id)}})


async def change_password(db: AsyncSession, user: User, data: ChangePasswordRequest) -> None:
    log.info("users.change_password.attempt", extra={"_extra_fields": {"user_id": str(user.id)}})
    if not verify_password(data.current_password, user.hashed_password):
        log.warning("users.change_password.wrong_password", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise UnauthorizedError("Current password is incorrect")
    validate_password_strength(data.new_password)
    user.hashed_password = hash_password(data.new_password)
    await UserRepository(db).save(user)
    await db.commit()
    log.info("users.change_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})


async def admin_reset_password(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    actor: User,
    send_email: bool = True,
) -> dict:
    """Administrator-issued password reset. The replacement is always
    generated server-side and delivered to the user's own inbox — it is never
    accepted from, or returned to, the admin, so a reset can't leak through
    the admin's browser or logs."""
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found")
    if actor.id == user.id:
        raise ValidationError("Use Settings → Security to change your own password")

    temp_password = secrets.token_urlsafe(12)
    user.hashed_password = hash_password(temp_password)
    await UserRepository(db).save(user)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        actor_name=actor.full_name or actor.email,
        action="user.password_reset",
        entity_type="user",
        entity_id=str(user.id),
        summary=f"Password reset for '{user.email}'",
    )
    await db.commit()
    log.info("users.admin_reset_password.success", extra={"_extra_fields": {"user_id": str(user.id)}})

    if send_email:
        tenant = await db.get(Tenant, tenant_id)
        await send_temp_password_email(
            to=user.email,
            full_name=user.full_name,
            tenant_name=tenant.name if tenant else str(tenant_id),
            temp_password=temp_password,
            reset_by=actor.full_name or actor.email,
        )
    return {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "emailed": send_email,
    }


async def get_user_activity(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, offset: int, limit: int
) -> tuple[list[AuditLogRead], int]:
    """The user's own actions plus every admin action taken against their
    account. 404s if the user isn't in this tenant, so activity can never be
    probed across tenants."""
    if await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id) is None:
        raise NotFoundError("User not found")
    items = await list_user_activity(db, tenant_id, user_id, offset, limit)
    total = await count_user_activity(db, tenant_id, user_id)
    return items, total


# --- helpers -------------------------------------------------------------


def _is_admin(user: User) -> bool:
    return bool(user.is_superuser) or (user.role or "").strip().lower() in {"admin", "owner"}


def _role_is_admin(role) -> bool:
    return (role.name or "").strip().lower() in {"admin", "owner"}


async def _assert_not_last_admin(db: AsyncSession, tenant_id: uuid.UUID, user: User, verb: str) -> None:
    """Refuse the operation if it would leave the company with no one able to
    manage it. Checked before every demote / deactivate / remove."""
    if not _is_admin(user):
        return
    active_admins = await UserRepository(db).count_active_admins(tenant_id)
    if active_admins <= 1:
        raise ConflictError(
            f"This is the company's only administrator — assign another admin before it is {verb}."
        )


async def _resolve_role(db: AsyncSession, tenant_id: uuid.UUID, role_id, role_str: str | None):
    """Returns the tenant's Role, or None when it can't be found.

    An explicit role_id wins and is checked for tenant ownership; otherwise
    the free-text role name is resolved, seeding the defaults if needed.
    Rejecting a foreign role_id is what stops a caller from granting a role
    belonging to another company."""
    if role_id is not None:
        role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
        if role is None:
            raise ValidationError("That role does not belong to this company")
        return role
    if not role_str:
        return None
    from app.modules.tenants import service

    resolved_id = await service.resolve_role_id(db, tenant_id, role_str)
    if resolved_id is None:
        return None
    return await RoleRepository(db).get_by_id_for_tenant(tenant_id, resolved_id)


def _update_summary(user: User, before: dict, payload: dict) -> str:
    bits: list[str] = []
    if "full_name" in payload:
        bits.append("name")
    if "phone" in payload:
        bits.append("phone")
    if "role" in payload or "role_id" in payload:
        bits.append(f"role ({user.role})")
    if "is_active" in payload:
        bits.append("status")
    if "branch_id" in payload:
        bits.append("branch")
    if "department_id" in payload:
        bits.append("department")
    if before.get("is_active") is not None and before["is_active"] != user.is_active:
        bits.append("status")
    detail = ", ".join(dict.fromkeys(bits)) or "details"
    return f"User '{user.email}' updated ({detail})"


def user_to_read(user: User) -> UserRead:
    data = UserRead.model_validate(user)
    data.permissions = user.permissions_names
    # Surfaced from the already-eager-loaded `tenant` relationship, so the
    # profile screen can show "which company is this person in" without a
    # second query.
    data.tenant_name = user.tenant.name if user.tenant else None
    return data
