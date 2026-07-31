import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.sales.models.customer import Customer
from app.modules.sales.repository import CustomerRepository
from app.modules.sales.schemas import CustomerCreate, CustomerRead, CustomerUpdate


async def list_customers(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[CustomerRead]:
    items = await CustomerRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [CustomerRead.model_validate(i) for i in items]


async def count_customers(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await CustomerRepository(db).count_for_tenant(tenant_id)


async def get_customer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> CustomerRead:
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Customer not found")
    return CustomerRead.model_validate(obj)


async def create_customer(db: AsyncSession, tenant_id: uuid.UUID, data: CustomerCreate) -> CustomerRead:
    obj = Customer(tenant_id=tenant_id, **data.model_dump())
    obj = await CustomerRepository(db).save(obj)
    await db.commit()
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return CustomerRead.model_validate(obj)


async def update_customer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: CustomerUpdate) -> CustomerRead:
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Customer not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await CustomerRepository(db).save(obj)
    await db.commit()
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    return CustomerRead.model_validate(obj)


async def delete_customer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Customer not found")
    await CustomerRepository(db).delete(obj)
    await db.commit()
