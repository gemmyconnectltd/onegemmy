from typing import Annotated

from fastapi import Depends

from app.core.deps import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.tenants.models import User

SUPERADMIN = "superadmin"
MANAGER = "support_manager"
AGENT = "support_agent"
STAFF_ROLES = (SUPERADMIN, MANAGER, AGENT)


async def get_support_staff(user: CurrentUser) -> User:
    """Pesaa's own support team: platform users (no tenant) holding a support role. A business user — even a
    tenant owner with is_superuser — can never be staff, so no tenant ever reaches the support inbox."""
    if user.tenant_id is not None or not user.is_active or user.role not in STAFF_ROLES:
        raise ForbiddenError("Support staff access required")
    if user.role == SUPERADMIN and not user.is_superuser:
        raise ForbiddenError("Support staff access required")
    return user


SupportStaff = Annotated[User, Depends(get_support_staff)]


async def require_manager(user: SupportStaff) -> User:
    if user.role not in (SUPERADMIN, MANAGER):
        raise ForbiddenError("Support manager access required")
    return user


async def require_superadmin(user: SupportStaff) -> User:
    if user.role != SUPERADMIN:
        raise ForbiddenError("Super Admin access required")
    return user


SupportManager = Annotated[User, Depends(require_manager)]
SupportSuperAdmin = Annotated[User, Depends(require_superadmin)]


def is_manager(user: User) -> bool:
    return user.role in (SUPERADMIN, MANAGER)
