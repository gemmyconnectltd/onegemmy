import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.inventory.models.batch import InventoryBatch
from app.modules.inventory.repository.batch import BatchRepository
from app.modules.inventory.schemas.batch import BatchCreate, BatchRead, BatchUpdate


def _to_read(obj: InventoryBatch) -> BatchRead:
    r = BatchRead.model_validate(obj)
    r.product_name = obj.product.name if obj.product else None
    r.supplier_name = obj.supplier.name if obj.supplier else None
    if obj.expiry_date:
        r.days_to_expiry = (obj.expiry_date - date.today()).days
    return r


async def list_batches(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID | None,
                       expiring_in_days: int | None, offset: int, limit: int) -> list[BatchRead]:
    items = await BatchRepository(db).list_for_tenant(tenant_id, product_id, expiring_in_days, offset, limit)
    return [_to_read(i) for i in items]


async def count_batches(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID | None,
                        expiring_in_days: int | None) -> int:
    return await BatchRepository(db).count_for_tenant(tenant_id, product_id, expiring_in_days)


async def get_batch(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> BatchRead:
    obj = await BatchRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Batch not found")
    return _to_read(obj)


async def create_batch(db: AsyncSession, tenant_id: uuid.UUID, data: BatchCreate) -> BatchRead:
    repo = BatchRepository(db)
    existing = await repo.get_by_batch_number(tenant_id, data.batch_number)
    if existing:
        raise ConflictError(f"Batch number '{data.batch_number}' already exists")
    obj = InventoryBatch(
        tenant_id=tenant_id,
        product_id=data.product_id,
        variant_id=data.variant_id,
        purchase_order_id=data.purchase_order_id,
        batch_number=data.batch_number,
        quantity=data.quantity,
        quantity_remaining=data.quantity,
        unit_cost=data.unit_cost,
        manufactured_date=data.manufactured_date,
        expiry_date=data.expiry_date,
        supplier_id=data.supplier_id,
        notes=data.notes,
    )
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return _to_read(obj)


async def update_batch(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: BatchUpdate) -> BatchRead:
    repo = BatchRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Batch not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return _to_read(obj)


async def delete_batch(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await BatchRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Batch not found")
    await BatchRepository(db).delete(obj)
    await db.commit()
