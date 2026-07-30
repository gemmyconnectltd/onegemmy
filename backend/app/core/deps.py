import uuid
from typing import Annotated

from fastapi import Depends
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

    log.debug("auth.user_authenticated", extra={"_extra_fields": {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": user.role,
        "permissions": user.permissions_names,
    }})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_active_superuser(user: CurrentUser) -> User:
    if not user.is_superuser:
        log.warning("auth.forbidden_not_superuser", extra={"_extra_fields": {"user_id": str(user.id)}})
        raise ForbiddenError("Superuser privileges required")
    return user


SuperUser = Annotated[User, Depends(get_current_active_superuser)]


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
