import uuid
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import decode_token
from app.modules.tenants.models import User
from app.modules.tenants.service import get_user_by_id_global, get_user_by_id_raw

log = get_logger("deps")
oauth2_scheme = HTTPBearer()


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession, credentials: Annotated[HTTPAuthorizationCredentials, Depends(oauth2_scheme)]
) -> User:
    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        log.warning("auth.invalid_token")
        raise UnauthorizedError("Invalid or expired token")

    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    if user_id is None:
        log.warning("auth.invalid_payload")
        raise UnauthorizedError("Invalid token payload")

    if tenant_id:
        user = await get_user_by_id_raw(db, uuid.UUID(tenant_id), uuid.UUID(user_id))
    else:
        user = await get_user_by_id_global(db, uuid.UUID(user_id))

    if not user or not user.is_active:
        log.warning("auth.inactive_user", extra={"_extra_fields": {"user_id": user_id}})
        raise UnauthorizedError("User is inactive")
    if user.tenant is not None and not user.tenant.is_active:
        log.warning("auth.suspended_tenant", extra={"_extra_fields": {"user_id": user_id, "tenant_id": tenant_id}})
        raise UnauthorizedError("This account has been suspended")

    log.debug("auth.user_authenticated", extra={"_extra_fields": {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": user.role,
        "permissions": user.permissions_names,
    }})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_active_superuser(user: CurrentUser) -> User:
    # Platform superadmin only: a tenant admin is `is_superuser=True` within
    # their own tenant but must never reach the global /admin/* console.
    # role == "superadmin" is checked explicitly (not just tenant_id is None)
    # since a deleted tenant's owner can be left with tenant_id=NULL while
    # still is_superuser=True and role="owner" — that must never satisfy this.
    if not user.is_superuser or user.tenant_id is not None or user.role != "superadmin":
        log.warning("auth.forbidden_not_superuser", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise ForbiddenError("Superuser privileges required")
    return user


SuperUser = Annotated[User, Depends(get_current_active_superuser)]


async def get_active_branch_id(
    current_user: CurrentUser,
    db: DbSession,
    x_branch_id: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None,
) -> uuid.UUID | None:
    """Resolves which branch the current request acts on.

    A user tied to a single branch (the common case — a cashier, a branch
    manager) always acts in that branch; the header is ignored for them so
    they can never spoof another branch's data by sending one. A user with
    no fixed branch (branch_id is null — an Admin/Owner with implicit
    access to every branch) may pass X-Branch-Id to act on a specific one;
    it's validated to actually belong to their tenant here, not trusted
    blindly. Returns None when no branch could be resolved at all (an
    unassigned user sent no header) — callers that need a definite branch
    (e.g. a POS sale) should fall back to the tenant's main branch rather
    than treat None as "no branch restriction" themselves.
    """
    if current_user.branch_id is not None:
        return current_user.branch_id
    if x_branch_id is None or current_user.tenant_id is None:
        return None
    from app.modules.tenants.repository import BranchRepository

    branch = await BranchRepository(db).get_by_id_for_tenant(current_user.tenant_id, x_branch_id)
    return branch.id if branch else None


ActiveBranchId = Annotated[uuid.UUID | None, Depends(get_active_branch_id)]


def require_permission(permission_name: str):
    async def _check(user: CurrentUser) -> User:
        if user.is_superuser:
            return user
        if permission_name not in user.permissions_names:
            log.warning("auth.forbidden_no_permission", extra={"_extra_fields": {
                "user_id": str(user.id),
                "required": permission_name,
            }})
            raise ForbiddenError(f"Permission required: {permission_name}")
        return user
    return _check


def require_feature(feature_key: str):
    """Gate a whole router (or route) behind a tenant feature flag.

    Platform superusers (no tenant) bypass the check so the /admin console
    keeps working regardless of tenant entitlements.
    """
    async def _check(db: DbSession, user: CurrentUser) -> User:
        if user.tenant_id is None:
            return user
        from app.modules.tenants import service

        if not await service.feature_enabled(db, user.tenant_id, feature_key):
            log.warning("features.forbidden_disabled", extra={"_extra_fields": {
                "tenant_id": str(user.tenant_id),
                "feature": feature_key,
            }})
            raise ForbiddenError("This feature is not enabled for your company")
        return user
    return _check
