import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.repository import SupplierRepository
from app.modules.inventory.schemas import SupplierCreate, SupplierRead, SupplierUpdate


async def get_supplier(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> SupplierRead:
    obj = await SupplierRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier not found")
    return SupplierRead.model_validate(obj)


async def list_suppliers(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[SupplierRead]:
    items = await SupplierRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [SupplierRead.model_validate(i) for i in items]


async def count_suppliers(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await SupplierRepository(db).count_for_tenant(tenant_id)


async def create_supplier(db: AsyncSession, tenant_id: uuid.UUID, data: SupplierCreate) -> SupplierRead:
    obj = Supplier(tenant_id=tenant_id, **data.model_dump())
    obj = await SupplierRepository(db).save(obj)
    await db.commit()
    return SupplierRead.model_validate(obj)


async def update_supplier(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: SupplierUpdate) -> SupplierRead:
    obj = await SupplierRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await SupplierRepository(db).save(obj)
    await db.commit()
    return SupplierRead.model_validate(obj)


async def delete_supplier(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await SupplierRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier not found")
    await SupplierRepository(db).delete(obj)
    await db.commit()
