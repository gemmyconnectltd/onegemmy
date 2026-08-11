import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer, StockTransferItem
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.repository import TransferRepository
from app.modules.inventory.schemas import (
    StockTransferCreate,
    StockTransferRead,
    StockTransferUpdate,
)


async def _transfer_to_read(obj: StockTransfer) -> StockTransferRead:
    read = StockTransferRead.model_validate(obj)
    read.from_branch_name = obj.from_branch.name if obj.from_branch else None
    read.to_branch_name = obj.to_branch.name if obj.to_branch else None
    return read


async def list_transfers(
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 20
) -> list[StockTransferRead]:
    items = await TransferRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [await _transfer_to_read(t) for t in items]


async def count_transfers(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await TransferRepository(db).count_for_tenant(tenant_id, status)


async def get_transfer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> StockTransferRead:
    obj = await TransferRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transfer not found")
    return await _transfer_to_read(obj)


async def create_transfer(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: StockTransferCreate
) -> StockTransferRead:
    if data.from_branch_id and data.to_branch_id and data.from_branch_id == data.to_branch_id:
        raise ValidationError("Source and destination branch must be different")
    if not data.items:
        raise ValidationError("A transfer needs at least one item")
    repo = TransferRepository(db)
    transfer = StockTransfer(
        tenant_id=tenant_id,
        transfer_number=await repo.next_transfer_number(tenant_id),
        from_branch_id=data.from_branch_id,
        to_branch_id=data.to_branch_id,
        status="pending",
        notes=data.notes,
        created_by=user_id,
    )
    transfer = await repo.save(transfer)

    for item_data in data.items:
        await _validate_transfer_item(db, tenant_id, item_data.product_id, item_data.variant_id)
        db.add(StockTransferItem(
            transfer_id=transfer.id,
            product_id=item_data.product_id,
            variant_id=item_data.variant_id,
            product_name=item_data.product_name,
            sku=item_data.sku,
            variant_attributes=item_data.variant_attributes,
            quantity=item_data.quantity,
        ))

    await db.commit()
    return await _transfer_to_read(await repo.get_by_id_for_tenant(tenant_id, transfer.id))


async def _validate_transfer_item(db: AsyncSession, tenant_id: uuid.UUID, product_id, variant_id) -> None:
    if variant_id:
        variant = await db.get(ProductVariant, variant_id)
        if variant is None:
            raise ValidationError(f"Variant '{variant_id}' not found")
        product = await db.get(Product, variant.product_id)
        if product is None or product.tenant_id != tenant_id:
            raise ValidationError("Variant not found in this tenant")
    elif product_id:
        product = await db.get(Product, product_id)
        if product is None or product.tenant_id != tenant_id:
            raise ValidationError(f"Product '{product_id}' not found in this tenant")


async def update_transfer(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, data: StockTransferUpdate
) -> StockTransferRead:
    obj = await TransferRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transfer not found")
    if obj.status in ("completed", "cancelled"):
        raise ValidationError("A completed or cancelled transfer cannot be updated")
    if data.status is not None:
        if data.status not in ("pending", "in_transit", "completed", "cancelled"):
            raise ValidationError("Invalid transfer status")
        obj.status = data.status
        obj.completed_at = datetime.now(UTC) if data.status == "completed" else None
    if data.notes is not None:
        obj.notes = data.notes
    obj = await TransferRepository(db).save(obj)
    await db.commit()
    return await _transfer_to_read(await TransferRepository(db).get_by_id_for_tenant(tenant_id, id))


async def delete_transfer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await TransferRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transfer not found")
    if obj.status in ("in_transit", "completed"):
        raise ValidationError("Only pending transfers can be deleted")
    await TransferRepository(db).delete(obj)
    await db.commit()
