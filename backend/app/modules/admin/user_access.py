"""Platform management of employee feature switches within a selected business."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import MODULE_RESOURCES
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.billing.repository import BillingRepository
from app.modules.tenants.models import User
from app.modules.tenants.repository import UserRepository
from app.modules.tenants.schemas import UserUpdate
from app.modules.tenants.service.access import user_access
from app.modules.tenants.service.user import update_user


async def employee_access(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    return await user_access(db, tenant_id, user)


async def set_employee_feature(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID,
    module: str, enabled: bool, actor: User,
) -> dict:
    if module not in MODULE_RESOURCES:
        raise ValidationError("Unknown feature")
    # Serialize switches with the owner management path; preserve other modules.
    await BillingRepository(db).tenant(tenant_id, lock=True)
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    disabled = set(user.disabled_modules or [])
    if enabled:
        disabled.discard(module)
    else:
        disabled.add(module)
    await update_user(
        db, tenant_id, user_id, UserUpdate(disabled_modules=sorted(disabled)), actor=actor,
    )
    return await employee_access(db, tenant_id, user_id)
