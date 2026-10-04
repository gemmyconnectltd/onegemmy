import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.repository import PurchaseOrderRepository
from app.modules.procurement.schemas import (
    PurchaseCreate,
    PurchaseRead,
    PurchaseUpdate,
)
from app.modules.procurement.service.supplier_bill import create_bill_for_purchase


async def list_purchases(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[PurchaseRead]:
    items = await PurchaseOrderRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [PurchaseRead.model_validate(i) for i in items]


async def count_purchases(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await PurchaseOrderRepository(db).count_for_tenant(tenant_id, status)


async def get_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseRead:
    obj = await PurchaseOrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    return PurchaseRead.model_validate(obj)


async def _resolve_receiving_branch_id(
    db: AsyncSession, tenant_id: uuid.UUID, active_branch_id: uuid.UUID | None, client_branch_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Same resolution order as sales' order branch_id (see
    sales/service/order._resolve_order_branch_id): the server-derived
    active branch always wins, a client-supplied one is only used after
    being confirmed to belong to this tenant, and the tenant's main branch
    is the final fallback so a PO always ends up attributed somewhere."""
    from app.modules.tenants.repository import BranchRepository

    repo = BranchRepository(db)
    if active_branch_id is not None:
        return active_branch_id
    if client_branch_id is not None:
        branch = await repo.get_by_id_for_tenant(tenant_id, client_branch_id)
        if branch is not None:
            return branch.id
    main = await repo.get_main_for_tenant(tenant_id)
    return main.id if main else None


async def _build_items(db: AsyncSession, tenant_id: uuid.UUID, purchase: PurchaseOrder, items) -> None:
    """Validate each item resolves to a tenant-owned product/variant and persist snapshots."""
    for item_data in items:
        variant = None
        product = None
        variant_attributes = item_data.variant_attributes
        product_name = item_data.product_name
        sku = item_data.sku

        if not item_data.variant_id and not item_data.product_id:
            raise ValidationError(f"Item '{item_data.product_name}' must reference a product or variant")

        if item_data.variant_id:
            variant = await db.get(ProductVariant, item_data.variant_id)
            if variant is None:
                raise ValidationError(f"Variant '{item_data.variant_id}' not found")
            product = await db.get(Product, variant.product_id)
            if product is None or product.tenant_id != tenant_id:
                raise ValidationError(f"Variant '{item_data.variant_id}' not found in this tenant")
            product_name = product.name
            sku = variant.sku or product.sku
            variant_attributes = variant.attributes
        elif item_data.product_id:
            product = await db.get(Product, item_data.product_id)
            if product is None or product.tenant_id != tenant_id:
                raise ValidationError(f"Product '{item_data.product_id}' not found in this tenant")
            if product.has_variants:
                raise ValidationError(f"Product '{product.name}' has variants — pick a specific variant")

        line_total = round(float(item_data.unit_cost) * float(item_data.quantity), 2)
        item = PurchaseItem(
            purchase_order_id=purchase.id,
            product_id=variant.product_id if variant else item_data.product_id,
            variant_id=variant.id if variant else item_data.variant_id,
            product_name=product_name,
            sku=sku,
            variant_attributes=variant_attributes,
            unit_cost=item_data.unit_cost,
            quantity=item_data.quantity,
            line_total=line_total,
        )
        purchase.items.append(item)
        db.add(item)


async def _apply_receive(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, purchase: PurchaseOrder) -> None:
    """Stock in all items, raise the supplier bill, and post the accounting
    entry. Caller commits."""
    for item in purchase.items:
        if item.variant_id:
            variant = await db.get(ProductVariant, item.variant_id)
            if variant is None:
                raise ValidationError(f"Variant for '{item.product_name}' not found")
            product = await db.get(Product, variant.product_id)
            factor = float(product.conversion_factor) if product else 1.0
            variant.stock = float(variant.stock) + (float(item.quantity) * factor)
        elif item.product_id:
            product = await db.get(Product, item.product_id)
            if product is None:
                raise ValidationError(f"Product '{item.product_name}' not found")
            factor = float(product.conversion_factor)
            product.stock = float(product.stock) + (float(item.quantity) * factor)

    purchase.status = "Received"
    purchase.received_at = datetime.now(UTC)
    # Receiving goods creates a liability to the supplier (a bill), not an
    # assumption that they were paid in cash on the spot — see
    # procurement/service/supplier_bill.py for the Accounts Payable posting
    # and the separate supplier-payment flow that settles it.
    await create_bill_for_purchase(db, tenant_id, user_id, purchase)


async def create_purchase(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: PurchaseCreate,
    active_branch_id: uuid.UUID | None = None,
) -> PurchaseRead:
    repo = PurchaseOrderRepository(db)
    reference = await repo.next_reference(tenant_id)

    subtotal = sum(round(float(i.unit_cost) * float(i.quantity), 2) for i in data.items)
    total = round(subtotal - data.discount + data.tax, 2)
    branch_id = await _resolve_receiving_branch_id(db, tenant_id, active_branch_id, data.branch_id)

    purchase = PurchaseOrder(
        tenant_id=tenant_id,
        reference=reference,
        supplier_id=data.supplier_id,
        branch_id=branch_id,
        created_by=user_id,
        status=data.status,
        subtotal=subtotal,
        discount=data.discount,
        tax=data.tax,
        total=total,
        notes=data.notes,
        expected_date=data.expected_date,
    )
    purchase = await repo.save(purchase)
    await _build_items(db, tenant_id, purchase, data.items)

    if data.status == "Received":
        await _apply_receive(db, tenant_id, user_id, purchase)

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, purchase.id)
    return PurchaseRead.model_validate(obj)


async def receive_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID) -> PurchaseRead:
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError(f"Cannot receive a purchase with status '{obj.status}'")

    await _apply_receive(db, tenant_id, user_id, obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PurchaseRead.model_validate(obj)


async def update_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: PurchaseUpdate) -> PurchaseRead:
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError("Only draft purchases can be edited")
    update_fields = data.model_dump(exclude_unset=True)
    if "branch_id" in update_fields and update_fields["branch_id"] is not None:
        from app.modules.tenants.repository import BranchRepository

        branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, update_fields["branch_id"])
        if branch is None:
            raise ValidationError("That branch does not belong to your company")
    for field, value in update_fields.items():
        setattr(obj, field, value)
    obj.total = round(float(obj.subtotal) - float(obj.discount) + float(obj.tax), 2)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PurchaseRead.model_validate(obj)


async def cancel_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseRead:
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError(f"Cannot cancel a purchase with status '{obj.status}'")
    obj.status = "Cancelled"
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PurchaseRead.model_validate(obj)


async def delete_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError("Only draft purchases can be deleted")
    await repo.delete(obj)
    await db.commit()
