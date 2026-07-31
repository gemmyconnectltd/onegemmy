import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.sales.models.deal import Deal
from app.modules.sales.repository import DealRepository
from app.modules.sales.schemas import DealCreate, DealRead, DealUpdate


async def list_deals(db: AsyncSession, tenant_id: uuid.UUID, stage: str | None = None, offset: int = 0, limit: int = 50) -> list[DealRead]:
    items = await DealRepository(db).list_for_tenant(tenant_id, stage, offset, limit)
    return [DealRead.model_validate(i) for i in items]


async def count_deals(db: AsyncSession, tenant_id: uuid.UUID, stage: str | None = None) -> int:
    return await DealRepository(db).count_for_tenant(tenant_id, stage)


async def get_deal(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> DealRead:
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Deal not found")
    return DealRead.model_validate(obj)


async def create_deal(db: AsyncSession, tenant_id: uuid.UUID, data: DealCreate) -> DealRead:
    obj = Deal(tenant_id=tenant_id, **data.model_dump())
    obj = await DealRepository(db).save(obj)
    await db.commit()
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return DealRead.model_validate(obj)


async def update_deal(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: DealUpdate) -> DealRead:
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Deal not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await DealRepository(db).save(obj)
    await db.commit()
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, id)
    return DealRead.model_validate(obj)


async def delete_deal(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Deal not found")
    await DealRepository(db).delete(obj)
    await db.commit()
