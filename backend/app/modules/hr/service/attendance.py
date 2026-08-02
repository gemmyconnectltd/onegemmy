import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.hr.models.attendance import Attendance
from app.modules.hr.repository import AttendanceRepository
from app.modules.hr.schemas import AttendanceCreate, AttendanceRead, AttendanceUpdate


async def list_attendance(db: AsyncSession, tenant_id: uuid.UUID, employee_id: uuid.UUID | None = None, status: str | None = None, offset: int = 0, limit: int = 50) -> list[AttendanceRead]:
    items = await AttendanceRepository(db).list_for_tenant(tenant_id, employee_id, status, offset, limit)
    return [AttendanceRead.model_validate(i) for i in items]


async def count_attendance(db: AsyncSession, tenant_id: uuid.UUID, employee_id: uuid.UUID | None = None, status: str | None = None) -> int:
    return await AttendanceRepository(db).count_for_tenant(tenant_id, employee_id, status)


async def get_attendance(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> AttendanceRead:
    obj = await AttendanceRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Attendance record not found")
    return AttendanceRead.model_validate(obj)


async def create_attendance(db: AsyncSession, tenant_id: uuid.UUID, data: AttendanceCreate) -> AttendanceRead:
    repo = AttendanceRepository(db)
    obj = Attendance(tenant_id=tenant_id, **data.model_dump())
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return AttendanceRead.model_validate(obj)


async def update_attendance(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: AttendanceUpdate) -> AttendanceRead:
    repo = AttendanceRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Attendance record not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return AttendanceRead.model_validate(obj)


async def delete_attendance(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = AttendanceRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Attendance record not found")
    await repo.delete(obj)
    await db.commit()
