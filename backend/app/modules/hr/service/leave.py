import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.hr.models.leave import LeaveRequest
from app.modules.hr.repository import LeaveRepository
from app.modules.hr.schemas import LeaveCreate, LeaveRead, LeaveUpdate


def _compute_days(from_date, to_date) -> int:
    return (to_date - from_date).days + 1


async def list_leave(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[LeaveRead]:
    items = await LeaveRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [LeaveRead.model_validate(i) for i in items]


async def count_leave(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await LeaveRepository(db).count_for_tenant(tenant_id, status)


async def get_leave(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> LeaveRead:
    obj = await LeaveRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Leave request not found")
    return LeaveRead.model_validate(obj)


async def create_leave(db: AsyncSession, tenant_id: uuid.UUID, data: LeaveCreate) -> LeaveRead:
    repo = LeaveRepository(db)
    if data.to_date < data.from_date:
        raise ValidationError("End date must be on or after start date")
    obj = LeaveRequest(
        tenant_id=tenant_id,
        days=_compute_days(data.from_date, data.to_date),
        **data.model_dump(),
    )
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return LeaveRead.model_validate(obj)


async def update_leave(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: LeaveUpdate) -> LeaveRead:
    repo = LeaveRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Leave request not found")
    if obj.status != "Pending":
        raise ValidationError(f"Only pending requests can be edited (current: {obj.status})")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    if obj.to_date < obj.from_date:
        raise ValidationError("End date must be on or after start date")
    obj.days = _compute_days(obj.from_date, obj.to_date)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return LeaveRead.model_validate(obj)


async def set_leave_status(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, status: str, user_id: uuid.UUID) -> LeaveRead:
    repo = LeaveRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Leave request not found")
    if obj.status != "Pending":
        raise ValidationError(f"Leave request is already {obj.status}")
    obj.status = status
    obj.approved_by = user_id
    obj.approved_at = datetime.now()
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return LeaveRead.model_validate(obj)


async def delete_leave(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = LeaveRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Leave request not found")
    await repo.delete(obj)
    await db.commit()
