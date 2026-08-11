import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.finance.schemas.tax import TaxCalculationCreate
from app.modules.finance.service.tax import create_tax_calculation
from app.modules.finance.service.transaction import create_sale_transaction
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.service.serial import mark_serial_sold
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.target import Target
from app.modules.sales.repository import OrderRepository
from app.modules.sales.schemas import OrderCreate, OrderRead, OrderUpdate


def _current_period() -> str:
    """Returns e.g. 'Jul 2025' — matches the period format used in targets."""
    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    d = datetime.now(UTC).date()
    return f"{months[d.month - 1]} {d.year}"


def _attr_label(attributes: dict | None) -> str:
    """Formats a variant attribute dict as e.g. 'Color: Red · Size: M'."""
    if not attributes:
        return ""
    return " · ".join(f"{k}: {v}" for k, v in attributes.items())


async def _bump_revenue_targets(db: AsyncSession, tenant_id: uuid.UUID, amount: float) -> None:
    """Increment achieved_value on all revenue/currency targets for the current period."""
    period = _current_period()
    await db.execute(
        update(Target)
        .where(
            Target.tenant_id == tenant_id,
            Target.period == period,
            Target.unit == "currency",
        )
        .values(achieved_value=Target.achieved_value + amount)
    )


async def _bump_order_targets(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """Increment achieved_value on all order-count targets for the current period."""
    period = _current_period()
    await db.execute(
        update(Target)
        .where(
            Target.tenant_id == tenant_id,
            Target.period == period,
            Target.unit == "number",
        )
        .values(achieved_value=Target.achieved_value + 1)
    )


async def _record_vat(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, tax_amount: float, total: float) -> None:
    """Write a VAT TaxCalculation record for a completed order."""
    if tax_amount <= 0:
        return
    period = datetime.now(UTC).date().strftime("%Y-%m")
    await create_tax_calculation(db, tenant_id, TaxCalculationCreate(
        calculation_type="vat",
        reference_type="sale",
        reference_id=str(order_id),
        period=period,
        taxable_amount=round(total - tax_amount, 2),
        tax_rate=18.0,
        tax_amount=round(tax_amount, 2),
        description=f"VAT on order {order_id}",
    ))


async def list_orders(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[OrderRead]:
    items = await OrderRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [OrderRead.model_validate(i) for i in items]


async def count_orders(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await OrderRepository(db).count_for_tenant(tenant_id, status)


async def get_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    return OrderRead.model_validate(obj)


async def create_order(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: OrderCreate) -> OrderRead:
    repo = OrderRepository(db)

    # Idempotency: replaying a client order id (e.g. an offline sale being
    # synced after a retry) must return the existing order, never double-create.
    if data.client_order_id:
        existing = await repo.find_by_client_order_id(tenant_id, data.client_order_id)
        if existing is not None:
            return OrderRead.model_validate(existing)

    order_number = await repo.next_order_number(tenant_id)

    subtotal = sum(item.line_total for item in data.items)
    total = round(subtotal - data.discount + data.tax, 2)

    order = Order(
        tenant_id=tenant_id,
        order_number=order_number,
        customer_id=data.customer_id,
        deal_id=data.deal_id,
        branch_id=data.branch_id,
        created_by=user_id,
        status=data.status,
        subtotal=subtotal,
        discount=data.discount,
        tax=data.tax,
        total=total,
        notes=data.notes,
        client_order_id=data.client_order_id,
    )
    order = await repo.save(order)

    for item_data in data.items:
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

        # stock check + decrement for Completed orders
        if data.status == "Completed":
            if variant and float(variant.stock) < item_data.quantity:
                raise ValidationError(
                    f"Insufficient stock for '{product_name}' ({_attr_label(variant.attributes)}): "
                    f"{variant.stock} available, {item_data.quantity} requested"
                )
            if product and not variant and float(product.stock) < item_data.quantity:
                raise ValidationError(
                    f"Insufficient stock for '{product_name}': "
                    f"{product.stock} available, {item_data.quantity} requested"
                )

        item = OrderItem(
            order_id=order.id,
            product_id=variant.product_id if variant else item_data.product_id,
            variant_id=variant.id if variant else item_data.variant_id,
            product_name=product_name,
            sku=sku,
            variant_attributes=variant_attributes,
            unit_price=item_data.unit_price,
            quantity=item_data.quantity,
            discount=item_data.discount,
            line_total=item_data.line_total,
        )
        db.add(item)

        # deduct stock when order is Completed — variants decrement variant stock
        if data.status == "Completed":
            if variant:
                variant.stock = max(0, float(variant.stock) - item_data.quantity)
            elif product:
                product.stock = max(0, float(product.stock) - item_data.quantity)

            await _assign_serials(
                db,
                tenant_id,
                product=product,
                serial_ids=item_data.serial_ids,
                quantity=item_data.quantity,
                order_item_id=item.id,
            )

    if data.status == "Completed":
        await _bump_revenue_targets(db, tenant_id, total)
        await _bump_order_targets(db, tenant_id)
        await create_sale_transaction(db, tenant_id, user_id, order.id, total, order_number)
        await _record_vat(db, tenant_id, order.id, data.tax, total)

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, order.id)
    return OrderRead.model_validate(obj)


async def _assign_serials(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    product,
    serial_ids: list[uuid.UUID] | None,
    quantity: float,
    order_item_id: uuid.UUID,
) -> None:
    """Bind sold serial numbers to a completed order line."""
    tracked = product.tracks_serials if product else False
    if not tracked:
        return
    if not serial_ids:
        raise ValidationError(f"Product '{product.name}' tracks serials — select serial numbers for each unit")
    if len(serial_ids) != quantity:
        raise ValidationError(
            f"Product '{product.name}' requires {int(quantity)} serial number(s), got {len(serial_ids)}"
        )
    for serial_id in serial_ids:
        await mark_serial_sold(db, tenant_id, serial_id, order_item_id, 0)


async def update_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: OrderUpdate) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    was_completed = obj.status == "Completed"
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj.total = round(float(obj.subtotal) - float(obj.discount) + float(obj.tax), 2)
    # if status just flipped to Completed, bump targets
    if not was_completed and obj.status == "Completed":
        await _bump_revenue_targets(db, tenant_id, float(obj.total))
        await _bump_order_targets(db, tenant_id)
        await create_sale_transaction(db, tenant_id, obj.created_by or id, obj.id, float(obj.total), obj.order_number)
        await _record_vat(db, tenant_id, obj.id, float(obj.tax), float(obj.total))
    await OrderRepository(db).save(obj)
    await db.commit()
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    return OrderRead.model_validate(obj)


async def delete_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status == "Completed":
        raise ValidationError("Cannot delete a completed order")
    await OrderRepository(db).delete(obj)
    await db.commit()
