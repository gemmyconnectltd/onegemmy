import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.procurement.models.purchase_return import PurchaseReturn
from app.modules.procurement.repository import PurchaseOrderRepository
from app.modules.procurement.repository.purchase_return import PurchaseReturnRepository
from app.modules.procurement.schemas.purchase_return import PurchaseReturnCreate, PurchaseReturnRead


def _to_read(obj: PurchaseReturn) -> PurchaseReturnRead:
    read = PurchaseReturnRead.model_validate(obj)
    read.po_reference = obj.purchase_order.reference if obj.purchase_order else None
    read.supplier_name = obj.purchase_order.supplier.name if obj.purchase_order and obj.purchase_order.supplier else None
    return read


async def list_returns(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[PurchaseReturnRead]:
    items = await PurchaseReturnRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [_to_read(i) for i in items]


async def count_returns(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await PurchaseReturnRepository(db).count_for_tenant(tenant_id)


async def get_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseReturnRead:
    obj = await PurchaseReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    return _to_read(obj)


async def _adjust_stock(db: AsyncSession, product_id: uuid.UUID | None, variant_id: uuid.UUID | None, delta: float) -> None:
    """delta < 0 removes stock (goods leaving for the supplier); delta > 0 restores it."""
    if variant_id:
        variant = await db.get(ProductVariant, variant_id)
        if variant is None:
            raise ValidationError("Variant not found")
        new_stock = float(variant.stock) + delta
        if new_stock < 0:
            raise ValidationError(f"Cannot return more than the {float(variant.stock)} in stock")
        variant.stock = new_stock
    elif product_id:
        product = await db.get(Product, product_id)
        if product is None:
            raise ValidationError("Product not found")
        new_stock = float(product.stock) + delta
        if new_stock < 0:
            raise ValidationError(f"Cannot return more than the {float(product.stock)} in stock")
        product.stock = new_stock


async def create_return(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: PurchaseReturnCreate) -> PurchaseReturnRead:
    po = await PurchaseOrderRepository(db).get_by_id_for_tenant(tenant_id, data.purchase_order_id)
    if po is None:
        raise NotFoundError("Purchase order not found")
    if po.status != "Received":
        raise ValidationError("Can only return items from a received purchase order")

    await _adjust_stock(db, data.product_id, data.variant_id, -data.quantity)

    repo = PurchaseReturnRepository(db)
    reference = await repo.next_reference(tenant_id)
    obj = PurchaseReturn(
        tenant_id=tenant_id,
        reference=reference,
        purchase_order_id=data.purchase_order_id,
        product_id=data.product_id,
        variant_id=data.variant_id,
        product_name=data.product_name,
        quantity=data.quantity,
        amount=data.amount,
        reason=data.reason,
        return_date=data.return_date or datetime.now(UTC).date(),
        processed_by=user_id,
        status="Processing",
    )
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return _to_read(obj)


async def _set_status(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, status: str) -> PurchaseReturnRead:
    repo = PurchaseReturnRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    if obj.status != "Processing":
        raise ValidationError(f"Cannot update a return with status '{obj.status}'")
    obj.status = status
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return _to_read(obj)


async def mark_refunded(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseReturnRead:
    return await _set_status(db, tenant_id, id, "Refunded")


async def mark_replaced(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseReturnRead:
    return await _set_status(db, tenant_id, id, "Replaced")


async def delete_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = PurchaseReturnRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    if obj.status != "Processing":
        raise ValidationError("Only returns still Processing can be deleted")
    # Undo the stock decrement made when this return was created.
    await _adjust_stock(db, obj.product_id, obj.variant_id, float(obj.quantity))
    await repo.delete(obj)
    await db.commit()
