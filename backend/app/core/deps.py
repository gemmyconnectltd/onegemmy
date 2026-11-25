import uuid
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import stock_context
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
    request: Request, db: DbSession, credentials: Annotated[HTTPAuthorizationCredentials, Depends(oauth2_scheme)]
) -> User:
    # Each request starts with no module states remembered (they are memoised per request in the session). A new request
    # normally has a new session anyway; this keeps that guarantee even if a session were ever reused across requests.
    from app.modules.tenants.service.feature import forget_modules
    forget_modules(db)
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
        if user.tenant.subscription_status == "pending":
            raise UnauthorizedError("This account is awaiting activation")
        log.warning("auth.suspended_tenant", extra={"_extra_fields": {"user_id": user_id, "tenant_id": tenant_id}})
        raise UnauthorizedError("This account has been suspended")

    # Capture the role's permission names now, while they are loaded: later work in this request (a commit, a refresh) can
    # expire the relationship, and the permission checks read it from a sync property.
    user.remember_permissions()
    if user.tenant_id is not None:
        from app.modules.billing.access import enforce_write
        await enforce_write(db, user.tenant_id, request.url.path, request.method)

    stock_context.current_user_id.set(user.id)
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
    branch = await _resolve_active_branch_id(current_user, db, x_branch_id)
    stock_context.current_branch_id.set(branch)  # the stock ledger takes stock from the warehouse of the branch the request acts on
    return branch


async def _resolve_active_branch_id(current_user: User, db: AsyncSession, x_branch_id: uuid.UUID | None) -> uuid.UUID | None:
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
    if current_user.branch_ids is not None:
        allowed = {uuid.UUID(str(id)) for id in current_user.branch_ids}
        if not allowed:
            raise ForbiddenError("No branches assigned. Ask an owner to assign a branch.")
        selected = x_branch_id or current_user.branch_id
        if selected is None and len(allowed) == 1:
            selected = next(iter(allowed))
        if selected is None:
            raise ForbiddenError("Select one of your assigned branches")
        if selected not in allowed:
            raise ForbiddenError("This branch is not assigned to your account")
        from app.modules.tenants.repository import BranchRepository
        if await BranchRepository(db).get_by_id_for_tenant(current_user.tenant_id, selected) is None:
            raise ForbiddenError("The assigned branch is unavailable; contact an owner")
        return selected
    if current_user.branch_id is not None:
        return current_user.branch_id
    if x_branch_id is None or current_user.tenant_id is None:
        return None
    from app.modules.tenants.repository import BranchRepository

    branch = await BranchRepository(db).get_by_id_for_tenant(current_user.tenant_id, x_branch_id)
    if branch is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Branch not found")
    return branch.id


ActiveBranchId = Annotated[uuid.UUID | None, Depends(get_active_branch_id)]


# Removing records is reserved for the people who run the business. Everyone else can create and edit, and asks an administrator to remove.
DELETE_ROLES = frozenset({"admin", "owner", "owner/ceo"})


def may_delete(user: User) -> bool:
    return bool(user.is_superuser) or (user.role or "").lower() in DELETE_ROLES


def require_permission(permission_name: str):
    async def _check(user: CurrentUser) -> User:
        if user.is_superuser:
            return user
        if permission_name.endswith(":delete") and not may_delete(user):
            raise ForbiddenError("Deleting is limited to business owners and administrators. Ask one of them to remove this.")
        # Business administration requires an owner/admin or an explicit grant.
        role = (user.role or "").lower()
        if role in ("admin", "owner"):
            return user
        if permission_name not in user.permissions_names:
            log.warning("auth.forbidden_no_permission", extra={"_extra_fields": {
                "user_id": str(user.id),
                "required": permission_name,
            }})
            raise ForbiddenError(f"Permission required: {permission_name}")
        return user
    return _check


async def _check_feature_control(request: Request, db: DbSession, user: User, module: str) -> None:
    """Pesaa's controls over the module and the part the path belongs to: status, schedule, beta, rollout and plan,
    kill switch, per-action and per-role rules, hours, daily limits and dependencies (see service.feature_control).
    Reads are never refused here. An accepted change is counted in the request's own transaction."""
    if request.method in ("GET", "HEAD", "OPTIONS") and "export" not in request.url.path.rsplit("/", 1)[-1]:
        return
    from app.core.access import READ_ONLY_POSTS, tenant_path
    from app.modules.tenants.service.feature_control import judge, record

    path = tenant_path(request.url.path)
    if request.method == "POST" and READ_ONLY_POSTS.search(path):
        return
    try:
        branch_id = uuid.UUID(request.headers["x-branch-id"]) if request.headers.get("x-branch-id") else None
    except ValueError:
        branch_id = None
    checks = [(module, path)]
    if module == "sales" and request.method == "POST" and path.rstrip("/") == "/sales/orders":
        # A till sale also answers to the POS module and to its parts (payment method, manual discount).
        from app.modules.tenants.feature_tree import sale_paths
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 — a body that is not JSON is the endpoint's own validation error
            body = None
        checks += [("pos", p) for p in sale_paths(body)]
    accepted = []
    why = None
    for mod, p in checks:
        verdict = await judge(db, user, mod, request.method, p, branch_id)
        if verdict.refused:
            why = verdict.refused
            break
        accepted.append(verdict)
    if why is None:
        for verdict in accepted:
            if verdict.record_key and verdict.action:
                await record(db, user.tenant_id, verdict.record_key, verdict.action)
        return
    if why:
        log.warning("features.control_refused", extra={"_extra_fields": {
            "tenant_id": str(user.tenant_id), "module": module, "method": request.method, "path": request.url.path,
        }})
        raise ForbiddenError(why)


async def _check_feature_item(request: Request, db: DbSession, user: User, module: str) -> None:
    """Inside a usable module, a submodule or feature Pesaa has switched off refuses new writes. Reads stay open so
    records can always be looked up and reconciled. Paths no feature covers cost no query."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    from app.core.access import READ_ONLY_POSTS, tenant_path
    from app.modules.tenants.service.feature_items import SWITCHED_OFF, blocked_feature

    path = tenant_path(request.url.path)
    if request.method == "POST" and READ_ONLY_POSTS.search(path):
        return
    blocked = await blocked_feature(db, user.tenant_id, module, path)
    if blocked is None:
        return
    why, name = blocked
    log.warning("features.item_blocked", extra={"_extra_fields": {
        "tenant_id": str(user.tenant_id), "module": module, "path": request.url.path, "why": why,
    }})
    if why == SWITCHED_OFF:
        raise ForbiddenError(f"{name} is switched off by Pesaa right now. Your existing records are kept and can still be viewed.")
    raise ForbiddenError(f"{name} is restricted for your business. Your existing records can still be viewed. Contact Pesaa support.")


def require_feature(feature_key: str):
    """Gate a whole router (or route) behind a tenant feature flag.

    Platform superusers (no tenant) bypass the check so the /admin console
    keeps working regardless of tenant entitlements. A module the business's own administrator has turned off
    (state "available") stays readable so history is never locked away, but takes no new writes.
    """
    async def _check(request: Request, db: DbSession, user: CurrentUser) -> User:
        if user.tenant_id is None:
            return user
        from app.modules.tenants import service

        status = await service.module_status(db, user.tenant_id, feature_key)
        if status == "enabled":
            await _check_feature_item(request, db, user, feature_key)  # per-business restriction first, so a refused
            await _check_feature_control(request, db, user, feature_key)  # change is never counted
            return user
        if status == "available" and request.method in ("GET", "HEAD", "OPTIONS"):
            return user
        label = feature_key.replace("_", " ").title()
        log.warning("features.forbidden_disabled", extra={"_extra_fields": {
            "tenant_id": str(user.tenant_id),
            "feature": feature_key,
            "status": status,
        }})
        if status == "available":
            raise ForbiddenError(f"{label} is turned off for your business. An administrator can turn it back on in Business Settings → Features & Modules.")
        if status == "restricted":
            raise ForbiddenError(f"{label} is currently restricted for your business. Contact Pesaa support.")
        raise ForbiddenError(f"{label} is not part of your plan. An owner can upgrade in Subscription & Billing.")
    return _check
