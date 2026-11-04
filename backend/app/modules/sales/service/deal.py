import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.deal import Deal
from app.modules.sales.repository import DealRepository
from app.modules.sales.schemas import DealCreate, DealRead, DealUpdate
from app.modules.tenants.models import User


async def _validate_links(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    customer_id: uuid.UUID | None,
    owner_id: uuid.UUID | None,
) -> None:
    if customer_id and (
        await db.execute(
            select(Customer.id).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
        )
    ).scalar_one_or_none() is None:
        raise NotFoundError("Customer not found")
    if owner_id and (
        await db.execute(
            select(User.id).where(User.id == owner_id, User.tenant_id == tenant_id)
        )
    ).scalar_one_or_none() is None:
        raise NotFoundError("Deal owner not found")


async def list_deals(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    stage: str | None = None,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
) -> list[DealRead]:
    items = await DealRepository(db).list_for_tenant(tenant_id, stage, offset, limit, search)
    return [DealRead.model_validate(i) for i in items]


async def count_deals(
    db: AsyncSession, tenant_id: uuid.UUID, stage: str | None = None, search: str | None = None
) -> int:
    return await DealRepository(db).count_for_tenant(tenant_id, stage, search)


async def get_deal(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> DealRead:
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Deal not found")
    return DealRead.model_validate(obj)


async def create_deal(db: AsyncSession, tenant_id: uuid.UUID, data: DealCreate) -> DealRead:
    await _validate_links(db, tenant_id, data.customer_id, data.owner_id)
    obj = Deal(tenant_id=tenant_id, **data.model_dump())
    obj = await DealRepository(db).save(obj)
    await db.commit()
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return DealRead.model_validate(obj)


async def update_deal(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: DealUpdate) -> DealRead:
    obj = await DealRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Deal not found")
    changes = data.model_dump(exclude_unset=True)
    await _validate_links(
        db,
        tenant_id,
        changes.get("customer_id", obj.customer_id),
        changes.get("owner_id", obj.owner_id),
    )
    for field, value in changes.items():
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
