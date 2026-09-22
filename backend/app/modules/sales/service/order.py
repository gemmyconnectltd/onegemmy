import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.schemas.tax import TaxCalculationCreate
from app.modules.accounting.service.tax import (
    calculate_vat,
    create_tax_calculation,
    get_effective_vat_rate,
    is_vat_enabled,
)
from app.modules.accounting.service.transaction import create_sale_transaction
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.service.serial import mark_serial_sold
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.target import Target
from app.modules.sales.repository import CustomerRepository, OrderRepository
from app.modules.sales.schemas import (
    OrderBulkCreate,
    OrderBulkResult,
    OrderCreate,
    OrderItemCreate,
    OrderRead,
    OrderUpdate,
)


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


def _complete_sale_item(item: OrderItem, product_name: str, quantity: float, variant: ProductVariant | None, product: Product | None) -> float:
    """Validates stock, decrements it, snapshots cost_at_sale on the line, and returns this line's COGS."""
    if variant and float(variant.stock) < quantity:
        raise ValidationError(
            f"Insufficient stock for '{product_name}' ({_attr_label(variant.attributes)}): "
            f"{variant.stock} available, {quantity} requested"
        )
    if product and not variant and float(product.stock) < quantity:
        raise ValidationError(
            f"Insufficient stock for '{product_name}': {product.stock} available, {quantity} requested"
        )
    cost = float(variant.cost) if variant else (float(product.cost) if product else 0.0)
    item.cost_at_sale = cost
    if variant:
        variant.stock = max(0, float(variant.stock) - quantity)
    elif product:
        product.stock = max(0, float(product.stock) - quantity)
    return cost * quantity


async def _apply_vat(db: AsyncSession, tenant_id: uuid.UUID, gross: float) -> tuple[float, float, float]:
    """Every price in Pesaa (product selling price, POS line total, manual
    order unit price) is VAT-inclusive — `gross` already includes tax, so it
    is never added a second time. Returns (tax, total, vat_rate); `total`
    always equals `gross`, and `tax` is the VAT portion extracted from it
    using the tenant's configured rate (accounting_tax_configs), for
    reporting/posting purposes only.

    When the tenant has VAT disabled, tax is zero and nothing is extracted
    or posted — the whole gross is revenue."""
    if not await is_vat_enabled(db, tenant_id):
        return 0.0, round(gross, 2), 0.0
    rate = await get_effective_vat_rate(db, tenant_id)
    vat = calculate_vat(Decimal(str(gross)), inclusive=True, rate=rate)
    return round(vat["vat_amount"], 2), round(gross, 2), float(rate)


async def _record_vat(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, tax_amount: float, total: float, vat_rate: float) -> None:
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
        tax_rate=vat_rate,
        tax_amount=round(tax_amount, 2),
        description=f"VAT on order {order_id}",
    ))


async def list_orders(
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, search: str | None = None
) -> list[OrderRead]:
    items = await OrderRepository(db).list_for_tenant(tenant_id, status, offset, limit, search)
    return [OrderRead.model_validate(i) for i in items]


async def count_orders(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, search: str | None = None) -> int:
    return await OrderRepository(db).count_for_tenant(tenant_id, status, search)


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
    gross = round(subtotal - data.discount, 2)
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)

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
        tax=tax,
        total=total,
        notes=data.notes,
        client_order_id=data.client_order_id,
        payment_method=data.payment_method,
        amount_tendered=data.amount_tendered,
        change_due=data.change_due,
    )
    # imported orders may carry their original date; anything else keeps now()
    if data.ordered_at is not None:
        order.ordered_at = data.ordered_at if data.ordered_at.tzinfo else data.ordered_at.replace(tzinfo=UTC)
    order = await repo.save(order)

    cogs_total = 0.0
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

        # deduct stock + snapshot cost + post COGS when order is Completed
        if data.status == "Completed":
            cogs_total += _complete_sale_item(item, product_name, item_data.quantity, variant, product)

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
        await create_sale_transaction(
            db, tenant_id, user_id, order.id, total, order_number, cogs=round(cogs_total, 2), tax=tax,
            payment_method=data.payment_method, amount_paid=data.amount_tendered,
        )
        await _record_vat(db, tenant_id, order.id, tax, total, vat_rate)

    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=None,
        action="order.create",
        entity_type="order",
        entity_id=str(order.id),
        summary=f"Order {order_number} created ({data.status})",
        changes={"total": total, "items": len(data.items)},
    )
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


async def update_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: OrderUpdate, user_id: uuid.UUID | None = None, user_name: str | None = None) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    was_completed = obj.status == "Completed"
    before = obj.status
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    # Every price is VAT-inclusive — tax is always recomputed from the gross
    # (subtotal - discount) using the tenant's configured rate, never taken
    # from client input, so it can never be double-counted or drift from the
    # rest of the system's calculation.
    gross = round(float(obj.subtotal) - float(obj.discount), 2)
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)
    obj.tax = tax
    obj.total = total
    # if status just flipped to Completed, deduct stock, post COGS, and bump targets
    if not was_completed and obj.status == "Completed":
        cogs_total = 0.0
        for item in obj.items:
            cogs_total += _complete_sale_item(item, item.product_name, float(item.quantity), item.variant, item.product)
        await _bump_revenue_targets(db, tenant_id, float(obj.total))
        await _bump_order_targets(db, tenant_id)
        await create_sale_transaction(
            db, tenant_id, obj.created_by or id, obj.id, float(obj.total), obj.order_number, cogs=round(cogs_total, 2), tax=tax,
            payment_method=obj.payment_method, amount_paid=float(obj.amount_tendered) if obj.amount_tendered is not None else None,
        )
        await _record_vat(db, tenant_id, obj.id, tax, total, vat_rate)
    await OrderRepository(db).save(obj)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="order.update",
        entity_type="order",
        entity_id=str(id),
        summary=f"Order {obj.order_number} updated",
        changes={"before": {"status": before}, "after": {"status": obj.status}},
    )
    await db.commit()
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    return OrderRead.model_validate(obj)


async def delete_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID | None = None, user_name: str | None = None) -> None:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status == "Completed":
        raise ValidationError("Cannot delete a completed order")
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="order.delete",
        entity_type="order",
        entity_id=str(id),
        summary=f"Order {obj.order_number} deleted",
    )
    await OrderRepository(db).delete(obj)
    await db.commit()


async def bulk_create_orders(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: OrderBulkCreate) -> OrderBulkResult:
    """CSV-style order import. Each row is one order line; rows sharing the same
    `order_reference` are merged into a single order (that reference becomes the
    `client_order_id`, so re-running an import is idempotent and never double-creates).
    Products are resolved by SKU (tenant-scoped); the customer column is matched by
    email or name, and a new customer is created when no match is found. Every order
    goes through the normal create pipeline — VAT, stock, accounting and audit are
    all handled the same way a POS sale is.
    """
    product_repo = ProductRepository(db)
    customer_repo = CustomerRepository(db)

    # Load every customer's (id, email, name) once so per-group resolution is
    # dictionary lookups, not a query per row.
    by_email: dict[str, uuid.UUID] = {}
    by_name: dict[str, uuid.UUID] = {}
    for cust_id, email, name in await customer_repo.list_lookup_for_tenant(tenant_id):
        if email:
            by_email[email.strip().lower()] = cust_id
        if name:
            by_name[name.strip().lower()] = cust_id

    created = 0
    failed = 0
    errors: list[str] = []

    grouped: dict[str, list] = {}
    for line in data.items:
        ref = line.order_reference.strip()
        if not ref:
            failed += 1
            errors.append("Row skipped: 'orderReference' is required")
            continue
        grouped.setdefault(ref, []).append(line)

    for ref, lines in grouped.items():
        new_customer_key: str | None = None
        new_customer_is_email = False
        try:
            items: list[OrderItemCreate] = []
            for line in lines:
                product = await product_repo.get_by_sku(tenant_id, line.sku.strip())
                if product is None:
                    raise ValidationError(f"SKU '{line.sku}' not found")
                if product.has_variants:
                    raise ValidationError(
                        f"Product '{product.name}' has variants — use a variant SKU instead"
                    )
                items.append(OrderItemCreate(
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                ))

            if not items:
                raise ValidationError("Order has no lines")

            customer_id = None
            customer_value = next((l.customer for l in lines if l.customer and l.customer.strip()), None)
            if customer_value:
                value = customer_value.strip()
                if "@" in value:
                    key = value.lower()
                    customer_id = by_email.get(key)
                else:
                    key = value.lower()
                    customer_id = by_name.get(key)
                if customer_id is None:
                    customer = await customer_repo.save(Customer(tenant_id=tenant_id, name=value))
                    customer_id = customer.id
                    new_customer_key = value.lower()
                    new_customer_is_email = "@" in value
                    if new_customer_is_email:
                        by_email[new_customer_key] = customer.id
                    else:
                        by_name[new_customer_key] = customer.id

            status = lines[0].status.strip()
            if status not in ("Completed", "Pending"):
                status = "Completed"

            order_data = OrderCreate(
                customer_id=customer_id,
                status=status,
                notes=lines[0].notes or None,
                client_order_id=ref,
                payment_method=lines[0].payment_method or None,
                ordered_at=lines[0].ordered_at,
                items=items,
            )
            await create_order(db, tenant_id, user_id, order_data)
            created += 1
        except (ValidationError, NotFoundError) as e:
            await db.rollback()
            if new_customer_key is not None:
                (by_email if new_customer_is_email else by_name).pop(new_customer_key, None)
            failed += 1
            errors.append(f"{ref}: {e}")
        except Exception as e:  # noqa: BLE001 — fail-soft import, re-raise is worse
            await db.rollback()
            if new_customer_key is not None:
                (by_email if new_customer_is_email else by_name).pop(new_customer_key, None)
            failed += 1
            errors.append(f"{ref}: {type(e).__name__}: {e}")

    return OrderBulkResult(created=created, failed=failed, errors=errors)
