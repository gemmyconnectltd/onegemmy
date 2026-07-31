import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.sales.models.target import Target
from app.modules.sales.repository import TargetRepository
from app.modules.sales.schemas import TargetCreate, TargetRead, TargetUpdate


async def list_targets(db: AsyncSession, tenant_id: uuid.UUID, period: str | None = None, offset: int = 0, limit: int = 50) -> list[TargetRead]:
    items = await TargetRepository(db).list_for_tenant(tenant_id, period, offset, limit)
    return [TargetRead.model_validate(i) for i in items]


async def count_targets(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await TargetRepository(db).count_for_tenant(tenant_id)


async def get_target(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> TargetRead:
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Target not found")
    return TargetRead.model_validate(obj)


async def create_target(db: AsyncSession, tenant_id: uuid.UUID, data: TargetCreate) -> TargetRead:
    obj = Target(tenant_id=tenant_id, **data.model_dump())
    obj = await TargetRepository(db).save(obj)
    await db.commit()
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return TargetRead.model_validate(obj)


async def update_target(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: TargetUpdate) -> TargetRead:
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Target not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await TargetRepository(db).save(obj)
    await db.commit()
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    return TargetRead.model_validate(obj)


async def delete_target(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Target not found")
    await TargetRepository(db).delete(obj)
    await db.commit()
