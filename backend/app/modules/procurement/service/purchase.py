import uuid
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import to_base_amount
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.audit.service import record_audit
from app.modules.currency.service import document_rate, get_base_currency, resolve_document_currency
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.repository import PurchaseOrderRepository
from app.modules.procurement.repository.pricing import PurchasePricingRepository
from app.modules.procurement.schemas import (
    PurchaseCreate,
    PurchaseRead,
    PurchaseUpdate,
)
from app.modules.procurement.service.supplier_bill import create_bill_for_purchase


def _set_base_amounts(purchase: PurchaseOrder, base_currency: str) -> None:
    """(Re)derive the purchase's base_* amounts from its own amounts and its frozen rate."""
    code = purchase.currency_code or base_currency
    rate = document_rate(purchase)
    purchase.base_subtotal = to_base_amount(purchase.subtotal, code, base_currency, rate)
    purchase.base_discount = to_base_amount(purchase.discount, code, base_currency, rate)
    purchase.base_tax = to_base_amount(purchase.tax, code, base_currency, rate)
    purchase.base_total = to_base_amount(purchase.total, code, base_currency, rate)


async def list_purchases(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, **filters) -> list[PurchaseRead]:
    items = await PurchaseOrderRepository(db).list_for_tenant(tenant_id, status, offset, limit, **filters)
    return [PurchaseRead.model_validate(i) for i in items]


async def count_purchases(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, **filters) -> int:
    return await PurchaseOrderRepository(db).count_for_tenant(tenant_id, status, **filters)


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


async def _require_pricing(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, items) -> None:
    if not any(item.update_catalog_cost or item.selling_price is not None for item in items):
        return
    actor = await PurchasePricingRepository(db).actor(tenant_id, user_id)
    if actor is None or not actor.is_active or (not actor.is_superuser and "pricing:update" not in actor.permissions_names):
        raise ForbiddenError("Pricing update permission is required to change catalog cost or selling price")


async def _build_items(db: AsyncSession, tenant_id: uuid.UUID, purchase: PurchaseOrder, items) -> None:
    """Validate each item resolves to a tenant-owned product/variant and persist snapshots."""
    products, variants = await PurchasePricingRepository(db).catalog(tenant_id, items)
    for item_data in items:
        variant = None
        product = None
        variant_attributes = item_data.variant_attributes
        product_name = item_data.product_name
        sku = item_data.sku

        if not item_data.variant_id and not item_data.product_id:
            raise ValidationError(f"Item '{item_data.product_name}' must reference a product or variant")

        if item_data.variant_id:
            variant = variants.get(item_data.variant_id)
            if variant is None:
                raise ValidationError(f"Variant '{item_data.variant_id}' not found")
            product = products.get(variant.product_id)
            if product is None or product.tenant_id != tenant_id:
                raise ValidationError(f"Variant '{item_data.variant_id}' not found in this tenant")
            product_name = product.name
            sku = variant.sku or product.sku
            variant_attributes = variant.attributes
        elif item_data.product_id:
            product = products.get(item_data.product_id)
            if product is None or product.tenant_id != tenant_id:
                raise ValidationError(f"Product '{item_data.product_id}' not found in this tenant")
            if product.has_variants:
                raise ValidationError(f"Product '{product.name}' has variants — pick a specific variant")

        line_total = (item_data.unit_cost * item_data.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
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
            update_catalog_cost=item_data.update_catalog_cost,
            selling_price=item_data.selling_price,
        )
        purchase.items.append(item)
        db.add(item)


async def _apply_receive(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, purchase: PurchaseOrder, due_date: date | None = None) -> None:
    """Stock in all items, raise the supplier bill, and post the accounting
    entry. Caller commits."""
    await _require_pricing(db, tenant_id, user_id, purchase.items)
    products, variants = await PurchasePricingRepository(db).catalog(tenant_id, purchase.items)
    changes = []
    seen = {}
    for item in purchase.items:
        variant = variants.get(item.variant_id) if item.variant_id else None
        product = products.get(variant.product_id if variant else item.product_id)
        if product is None or (item.variant_id and variant is None):
            raise ValidationError("A purchase product or variant is no longer available")
        target = variant or product
        factor = Decimal(str(product.conversion_factor))
        if factor <= 0:
            raise ValidationError("Product conversion factor must be positive")
        new_cost = (Decimal(str(item.unit_cost)) * document_rate(purchase) / factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if item.update_catalog_cost and new_cost > Decimal("9999999999.99"):
            raise ValidationError("Converted catalog cost exceeds the supported amount")
        instruction = (new_cost if item.update_catalog_cost else None, item.selling_price)
        if target.id in seen and seen[target.id] != instruction and any(value is not None for value in instruction):
            raise ValidationError("Combine duplicate product lines before changing catalog prices")
        seen[target.id] = instruction
        old_cost, old_price = str(target.cost), str(target.price)
        target.stock = Decimal(str(target.stock)) + Decimal(str(item.quantity)) * factor
        if item.update_catalog_cost:
            target.cost = new_cost
        if item.selling_price is not None:
            target.price = item.selling_price
        if item.update_catalog_cost or item.selling_price is not None:
            changes.append({"product_id": str(product.id), "variant_id": str(variant.id) if variant else None, "previous_cost": old_cost, "new_cost": str(target.cost), "previous_price": old_price, "new_price": str(target.price)})
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, action="purchase.receive", entity_type="purchase", entity_id=str(purchase.id), summary=f"Received purchase {purchase.reference}", changes={"price_changes": changes})

    # Receipt is when the liability and ledger entry are created, so this is where the purchase's
    # currency, rate and base value become final.
    _set_base_amounts(purchase, await get_base_currency(db, tenant_id))
    purchase.status = "Received"
    purchase.received_at = datetime.now(UTC)
    # Receiving goods creates a liability to the supplier (a bill), not an
    # assumption that they were paid in cash on the spot — see
    # procurement/service/supplier_bill.py for the Accounts Payable posting
    # and the separate supplier-payment flow that settles it.
    await create_bill_for_purchase(db, tenant_id, user_id, purchase, due_date)


async def create_purchase(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: PurchaseCreate,
    active_branch_id: uuid.UUID | None = None,
) -> PurchaseRead:
    repo = PurchaseOrderRepository(db)
    if data.supplier_id and not await PurchasePricingRepository(db).supplier(tenant_id, data.supplier_id):
        raise ValidationError("Supplier not found in this company")
    await ReportingRepository(db).lock_tenant(tenant_id)
    await _require_pricing(db, tenant_id, user_id, data.items)
    reference = await repo.next_reference(tenant_id)

    subtotal = sum(((i.unit_cost * i.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for i in data.items), Decimal(0))
    total = round(subtotal - Decimal(str(data.discount)) + Decimal(str(data.tax)), 2)
    branch_id = await _resolve_receiving_branch_id(db, tenant_id, active_branch_id, data.branch_id)
    currency_code, fx_rate, base_ccy = await resolve_document_currency(
        db, tenant_id, data.currency_code, data.exchange_rate,
    )

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
        currency_code=currency_code,
        exchange_rate=fx_rate,
    )
    _set_base_amounts(purchase, base_ccy)
    purchase = await repo.save(purchase)
    await _build_items(db, tenant_id, purchase, data.items)

    if data.status == "Received":
        await _apply_receive(db, tenant_id, user_id, purchase)

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, purchase.id)
    return PurchaseRead.model_validate(obj)


async def receive_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, due_date: date | None = None) -> PurchaseRead:
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError(f"Cannot receive a purchase with status '{obj.status}'")

    await _apply_receive(db, tenant_id, user_id, obj, due_date)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PurchaseRead.model_validate(obj)


async def update_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: PurchaseUpdate, user_id: uuid.UUID | None = None) -> PurchaseRead:
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError("Only draft purchases can be edited")
    if data.supplier_id and not await PurchasePricingRepository(db).supplier(tenant_id, data.supplier_id):
        raise ValidationError("Supplier not found in this company")
    update_fields = data.model_dump(exclude_unset=True)
    new_items = update_fields.pop("items", None)
    if new_items is not None:
        if not data.items:
            raise ValidationError("A purchase must contain at least one item")
        # Validate permissions before replacing draft lines; catalog changes still wait for receipt.
        actor_id = user_id
        if any(item.update_catalog_cost or item.selling_price is not None for item in data.items):
            if actor_id is None:
                raise ForbiddenError("Pricing actor is required")
            await _require_pricing(db, tenant_id, actor_id, data.items)
        obj.items.clear()
        await db.flush()
        await _build_items(db, tenant_id, obj, data.items)
        obj.subtotal = sum(((item.unit_cost * item.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for item in data.items), Decimal(0))

    new_currency = update_fields.pop("currency_code", None)
    new_rate = update_fields.pop("exchange_rate", None)
    if new_currency is not None or new_rate is not None:
        obj.currency_code, obj.exchange_rate, _ = await resolve_document_currency(
            db, tenant_id, new_currency or obj.currency_code, new_rate,
        )
    if "branch_id" in update_fields and update_fields["branch_id"] is not None:
        from app.modules.tenants.repository import BranchRepository

        branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, update_fields["branch_id"])
        if branch is None:
            raise ValidationError("That branch does not belong to your company")
    for field, value in update_fields.items():
        setattr(obj, field, value)
    obj.total = (Decimal(str(obj.subtotal)) - Decimal(str(obj.discount)) + Decimal(str(obj.tax))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if obj.total < 0 or obj.total > Decimal("999999999999.99"):
        raise ValidationError("Purchase total is outside the supported amount")
    _set_base_amounts(obj, await get_base_currency(db, tenant_id))
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PurchaseRead.model_validate(obj)


async def cancel_purchase(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseRead:
    await ReportingRepository(db).lock_tenant(tenant_id)
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
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = PurchaseOrderRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Purchase not found")
    if obj.status != "Draft":
        raise ValidationError("Only draft purchases can be deleted")
    await repo.delete(obj)
    await db.commit()
