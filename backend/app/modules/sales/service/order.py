import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import ONE, compute_settlement, to_base_amount, to_decimal
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
from app.modules.currency.service import document_rate, get_base_currency, resolve_document_currency
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.service.serial import mark_serial_sold
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.sales.models.target import Target
from app.modules.sales.repository import CustomerRepository, OrderPaymentRepository, OrderRepository
from app.modules.sales.schemas import (
    OrderBulkCreate,
    OrderBulkResult,
    OrderCreate,
    OrderItemCreate,
    OrderRead,
    OrderUpdate,
)

_PAID_EPSILON = 0.01
STATUS_AWAITING_APPROVAL = "Awaiting Approval"
STATUS_REJECTED = "Rejected"


async def _daily_credit_limit(db: AsyncSession, tenant_id: uuid.UUID) -> Decimal | None:
    """The tenant's per-customer daily credit limit in base currency (None = no limit)."""
    from app.modules.tenants.models import Tenant

    return (await db.execute(select(Tenant.credit_daily_limit).where(Tenant.id == tenant_id))).scalar_one_or_none()


async def _exceeds_daily_credit_limit(
    db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID | None, new_credit_base: Decimal, on_day: date,
) -> bool:
    """True when granting `new_credit_base` more credit to this customer on `on_day` would pass the tenant's
    daily limit. The day's total is the credit already granted by COMPLETED sales that day (their stored
    credit_base), so later payments never free up room and unapproved requests never use any."""
    limit = await _daily_credit_limit(db, tenant_id)
    if limit is None or customer_id is None:
        return False
    already = await OrderRepository(db).credit_granted_on(tenant_id, customer_id, on_day)
    return already + new_credit_base > limit


def _base_value(value: float | Decimal, currency_code: str, base_currency: str, rate: Decimal) -> Decimal:
    """An order amount in the tenant's base currency at the order's frozen rate (see to_base_amount)."""
    return to_base_amount(value, currency_code, base_currency, rate)


def _set_base_amounts(order: Order, base_currency: str) -> None:
    """(Re)derive the order's base_* amounts from its own amounts and frozen rate."""
    code = order.currency_code or base_currency
    rate = document_rate(order)
    order.base_subtotal = _base_value(order.subtotal, code, base_currency, rate)
    order.base_discount = _base_value(order.discount, code, base_currency, rate)
    order.base_tax = _base_value(order.tax, code, base_currency, rate)
    order.base_total = _base_value(order.total, code, base_currency, rate)


def _checkout_payment(order: Order, base_currency: str, paid: float) -> tuple[dict, float]:
    """Currency fields for the payment taken at checkout, plus the base-currency cash for the
    ledger. The checkout payment happens at the order's own rate, so no FX can arise here."""
    code = order.currency_code or base_currency
    if code == base_currency:
        d = to_decimal(paid)
        return {"currency_code": code, "exchange_rate": ONE, "base_amount": d, "applied_amount": d, "base_applied_amount": d}, float(paid)
    s = compute_settlement(
        doc_currency=code, base_currency=base_currency, doc_rate=document_rate(order), doc_total=order.total,
        doc_base_total=order.base_total, paid_so_far=0, base_applied_so_far=0, pay_currency=code, pay_amount=paid,
        rate_at_payment=document_rate(order),
    )
    return {
        "currency_code": code, "exchange_rate": s.payment_rate, "base_amount": s.base_amount,
        "applied_amount": s.applied_amount, "base_applied_amount": s.base_applied_amount,
    }, float(s.base_amount)


def _to_order_read(obj: Order) -> OrderRead:
    """The single place OrderRead is ever built from an Order row — computes
    payment_status/outstanding_balance/is_overdue from amount_paid/total/
    due_date so every caller (list, get, create, update, record/reverse
    payment) shows the exact same numbers, never a value cached anywhere
    else that could drift."""
    read = OrderRead.model_validate(obj)
    total = float(obj.total)
    paid = float(obj.amount_paid)
    outstanding = round(max(0.0, total - paid), 2)
    read.outstanding_balance = outstanding
    if paid <= _PAID_EPSILON:
        read.payment_status = "Unpaid"
    elif outstanding <= _PAID_EPSILON:
        read.payment_status = "Paid"
    else:
        read.payment_status = "PartiallyPaid"
    read.is_overdue = bool(obj.due_date and outstanding > _PAID_EPSILON and obj.due_date < datetime.now(UTC).date())
    # What is still owed, in the tenant's base currency, at the invoice's own frozen rate (the amount
    # the ledger carries as receivable). Equal to `outstanding_balance` for base-currency orders.
    read.base_outstanding_balance = to_decimal(outstanding) * document_rate(obj)
    return read


def _resolve_amount_paid(amount_paid: float | None, amount_tendered: float | None, total: float) -> float:
    """"Amount Paid Now" resolution, in priority order: the explicit new
    field, then the legacy amount_tendered (POS today always sends this),
    then — when neither is given — the historical default of "fully paid",
    so every existing caller (bulk import, anything not yet updated) keeps
    behaving exactly as it did before this feature existed."""
    if amount_paid is not None:
        return round(min(max(amount_paid, 0.0), total), 2)
    if amount_tendered is not None:
        return round(min(max(amount_tendered, 0.0), total), 2)
    return round(total, 2)


def _require_credit_sale_fields(customer_id: uuid.UUID | None, due_date_: date | None, outstanding: float) -> None:
    if outstanding <= _PAID_EPSILON:
        return
    if customer_id is None:
        raise ValidationError("A customer is required for a credit sale or partial payment")
    if due_date_ is None:
        raise ValidationError("A due date is required for a credit sale or partial payment")


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
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50,
    search: str | None = None, payment_status: str | None = None,
) -> list[OrderRead]:
    items = await OrderRepository(db).list_for_tenant(tenant_id, status, offset, limit, search, payment_status)
    return [_to_order_read(i) for i in items]


async def count_orders(
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, search: str | None = None,
    payment_status: str | None = None,
) -> int:
    return await OrderRepository(db).count_for_tenant(tenant_id, status, search, payment_status)


async def get_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    return _to_order_read(obj)


async def _resolve_order_branch_id(
    db: AsyncSession, tenant_id: uuid.UUID, active_branch_id: uuid.UUID | None, client_branch_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Determines which branch an order belongs to. The active branch —
    derived server-side from the authenticated user's own branch, or an
    admin's X-Branch-Id header — always wins when present, so a POS
    terminal can never attribute a sale to a branch the cashier isn't in.
    Only when there's no active branch at all (an unassigned admin who
    sent no header, or a bulk import) does the client-supplied branch_id
    get used, and even then only after confirming it belongs to this
    tenant. Falls back to the tenant's main branch so every order ends up
    attributed somewhere rather than silently unbranded."""
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


async def create_order(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: OrderCreate,
    active_branch_id: uuid.UUID | None = None,
    can_approve_credit: bool = False,
    enforce_credit_limit: bool = True,
) -> OrderRead:
    repo = OrderRepository(db)

    # Idempotency: replaying a client order id (e.g. an offline sale being
    # synced after a retry) must return the existing order, never double-create.
    if data.client_order_id:
        existing = await repo.find_by_client_order_id(tenant_id, data.client_order_id)
        if existing is not None:
            return _to_order_read(existing)

    order_number = await repo.next_order_number(tenant_id)

    # Currency context, settled before any amount is stored: the order's own currency, the rate that
    # converts it to the tenant's base currency (frozen on the order), and the base currency itself.
    effective_at = (data.ordered_at if data.ordered_at and data.ordered_at.tzinfo else (
        data.ordered_at.replace(tzinfo=UTC) if data.ordered_at else datetime.now(UTC)
    ))
    currency_code, fx_rate, base_ccy = await resolve_document_currency(
        db, tenant_id, data.currency_code, data.exchange_rate, at=effective_at,
    )

    subtotal = sum(item.line_total for item in data.items)
    gross = round(subtotal - data.discount, 2)
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)

    resolved_paid = _resolve_amount_paid(data.amount_paid, data.amount_tendered, total) if data.status == "Completed" else 0.0
    outstanding = round(total - resolved_paid, 2)
    if data.status == "Completed":
        _require_credit_sale_fields(data.customer_id, data.due_date, outstanding)

    # Daily credit limit: a sale that leaves a balance unpaid is "credit". Over the customer's daily limit it is
    # held for approval (nothing posted) unless the seller can approve credit themselves (GM/CEO) or it is a
    # historical import. The credit actually granted is stored so the day's total can be summed later.
    credit_base: Decimal | None = None
    hold_for_approval = False
    over_limit_by_approver = False
    if data.status == "Completed" and outstanding > _PAID_EPSILON:
        credit_base = _base_value(outstanding, currency_code, base_ccy, fx_rate)
        if enforce_credit_limit and await _exceeds_daily_credit_limit(db, tenant_id, data.customer_id, credit_base, effective_at.date()):
            if can_approve_credit:
                over_limit_by_approver = True
            else:
                hold_for_approval = True
    completing = data.status == "Completed" and not hold_for_approval

    resolved_branch_id = await _resolve_order_branch_id(db, tenant_id, active_branch_id, data.branch_id)

    order = Order(
        tenant_id=tenant_id,
        order_number=order_number,
        customer_id=data.customer_id,
        deal_id=data.deal_id,
        branch_id=resolved_branch_id,
        created_by=user_id,
        status=STATUS_AWAITING_APPROVAL if hold_for_approval else data.status,
        requested_paid=resolved_paid if hold_for_approval else None,
        credit_base=None if hold_for_approval else credit_base,
        subtotal=subtotal,
        discount=data.discount,
        tax=tax,
        total=total,
        notes=data.notes,
        client_order_id=data.client_order_id,
        payment_method=data.payment_method,
        amount_tendered=data.amount_tendered,
        change_due=data.change_due,
        due_date=data.due_date,
        amount_paid=0,
        currency_code=currency_code,
        exchange_rate=fx_rate,
    )
    _set_base_amounts(order, base_ccy)
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
        if completing:
            cogs_total += _complete_sale_item(item, product_name, item_data.quantity, variant, product)

            await _assign_serials(
                db,
                tenant_id,
                product=product,
                serial_ids=item_data.serial_ids,
                quantity=item_data.quantity,
                order_item_id=item.id,
            )

    if completing:
        # Targets, the ledger and VAT records are all kept in the tenant's BASE currency; a foreign
        # invoice is converted once, at its frozen rate (identical numbers for base-currency orders).
        base_total, base_tax = float(order.base_total), float(order.base_tax)
        pay_fields, base_paid = _checkout_payment(order, base_ccy, resolved_paid) if resolved_paid > 0 else ({}, 0.0)
        await _bump_revenue_targets(db, tenant_id, base_total)
        await _bump_order_targets(db, tenant_id)
        sale_txn_id = await create_sale_transaction(
            db, tenant_id, user_id, order.id, base_total, order_number, cogs=round(cogs_total, 2), tax=base_tax,
            payment_method=data.payment_method, amount_paid=base_paid,
        )
        await _record_vat(db, tenant_id, order.id, base_tax, base_total, vat_rate)

        if resolved_paid > 0:
            # The checkout payment itself — its accounting entry is the sale
            # transaction just posted above (already split Cash/Bank/Mobile
            # vs AR), so this row is a ledger record only, not a second
            # posting. Every later top-up (record_payment) does post its own
            # transaction, since by then the sale transaction already exists.
            payment_repo = OrderPaymentRepository(db)
            reference = await payment_repo.next_reference(tenant_id)
            payment = OrderPayment(
                tenant_id=tenant_id,
                reference=reference,
                order_id=order.id,
                customer_id=data.customer_id,
                branch_id=data.branch_id,
                amount=resolved_paid,
                payment_method=data.payment_method,
                status="Completed",
                paid_at=order.ordered_at,
                received_by=user_id,
                accounting_transaction_id=sale_txn_id,
                **pay_fields,
            )
            db.add(payment)
            order.amount_paid = pay_fields["applied_amount"]

    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=None,
        action="order.create",
        entity_type="order",
        entity_id=str(order.id),
        summary=f"Order {order_number} created ({STATUS_AWAITING_APPROVAL if hold_for_approval else data.status})"
        + (" — credit over the daily limit, held for approval" if hold_for_approval else "")
        + (" — credit over the daily limit, granted by an approver" if over_limit_by_approver else ""),
        changes={
            "total": total, "items": len(data.items), "amount_paid": resolved_paid, "outstanding": outstanding,
            "credit_base": str(credit_base) if credit_base is not None else None,
            "held_for_approval": hold_for_approval,
            "currency": currency_code, "exchange_rate": str(fx_rate), "base_total": str(order.base_total),
        },
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, order.id)
    return _to_order_read(obj)


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


async def _finalize_completed_sale(
    db: AsyncSession, tenant_id: uuid.UUID, obj: Order, resolved_paid: float, base_ccy: str, vat_rate: float,
    user_id: uuid.UUID | None, txn_user_id: uuid.UUID,
) -> None:
    """Everything that makes an open order a real sale — stock out, COGS, targets, the sale ledger entry, VAT
    and the checkout payment row. Shared by "status flipped to Completed" (update_order) and by approving a
    held credit sale, so there is exactly one place that posts a sale."""
    cogs_total = 0.0
    for item in obj.items:
        cogs_total += _complete_sale_item(item, item.product_name, float(item.quantity), item.variant, item.product)
    # The rate frozen on the order (set at creation or while it was open) now becomes final:
    # everything below is posted in the tenant's base currency at that rate.
    base_total, base_tax = float(obj.base_total), float(obj.base_tax)
    pay_fields, base_paid = _checkout_payment(obj, base_ccy, resolved_paid) if resolved_paid > 0 else ({}, 0.0)
    await _bump_revenue_targets(db, tenant_id, base_total)
    await _bump_order_targets(db, tenant_id)
    sale_txn_id = await create_sale_transaction(
        db, tenant_id, txn_user_id, obj.id, base_total, obj.order_number, cogs=round(cogs_total, 2), tax=base_tax,
        payment_method=obj.payment_method, amount_paid=base_paid,
    )
    await _record_vat(db, tenant_id, obj.id, base_tax, base_total, vat_rate)

    if resolved_paid > 0:
        payment_repo = OrderPaymentRepository(db)
        reference = await payment_repo.next_reference(tenant_id)
        db.add(OrderPayment(
            tenant_id=tenant_id,
            reference=reference,
            order_id=obj.id,
            customer_id=obj.customer_id,
            branch_id=obj.branch_id,
            amount=resolved_paid,
            payment_method=obj.payment_method,
            status="Completed",
            paid_at=datetime.now(UTC),
            received_by=user_id,
            accounting_transaction_id=sale_txn_id,
            **pay_fields,
        ))
        obj.amount_paid = pay_fields["applied_amount"]


async def update_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: OrderUpdate, user_id: uuid.UUID | None = None, user_name: str | None = None) -> OrderRead:
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    was_completed = obj.status == "Completed"
    before = obj.status
    update_fields = data.model_dump(exclude_unset=True)
    # Approval is a decision, not an edit: an order held for approval can only leave that state through the
    # approve/reject endpoints (credit:approve), and nobody can PATCH an order into or out of it.
    new_status = update_fields.get("status")
    if new_status in (STATUS_AWAITING_APPROVAL, STATUS_REJECTED) or (
        obj.status == STATUS_AWAITING_APPROVAL and new_status not in (None, STATUS_AWAITING_APPROVAL)
    ):
        raise ValidationError("Orders awaiting approval can only be approved or rejected by someone with credit approval rights")
    base_ccy = await get_base_currency(db, tenant_id)
    # Currency / rate may only change while the order is still open: once Completed they are the
    # frozen basis of the ledger entries, and re-pricing them would silently rewrite history.
    new_currency = update_fields.pop("currency_code", None)
    new_rate = update_fields.pop("exchange_rate", None)
    if new_currency is not None or new_rate is not None:
        if was_completed:
            raise ValidationError("The currency and exchange rate of a completed order can't be changed")
        obj.currency_code, obj.exchange_rate, _ = await resolve_document_currency(
            db, tenant_id, new_currency or obj.currency_code, new_rate, at=obj.ordered_at,
        )
    if "branch_id" in update_fields and update_fields["branch_id"] is not None:
        from app.modules.tenants.repository import BranchRepository

        branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, update_fields["branch_id"])
        if branch is None:
            raise ValidationError("That branch does not belong to your company")
    for field, value in update_fields.items():
        setattr(obj, field, value)
    # Every price is VAT-inclusive — tax is always recomputed from the gross
    # (subtotal - discount) using the tenant's configured rate, never taken
    # from client input, so it can never be double-counted or drift from the
    # rest of the system's calculation.
    gross = round(float(obj.subtotal) - float(obj.discount), 2)
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)
    obj.tax = tax
    obj.total = total
    _set_base_amounts(obj, base_ccy)
    # if status just flipped to Completed, deduct stock, post COGS, and bump targets
    if not was_completed and obj.status == "Completed":
        resolved_paid = _resolve_amount_paid(
            None, float(obj.amount_tendered) if obj.amount_tendered is not None else None, float(obj.total),
        )
        outstanding = round(float(obj.total) - resolved_paid, 2)
        _require_credit_sale_fields(obj.customer_id, obj.due_date, outstanding)
        if outstanding > _PAID_EPSILON:
            obj.credit_base = _base_value(outstanding, obj.currency_code or base_ccy, base_ccy, document_rate(obj))

        await _finalize_completed_sale(db, tenant_id, obj, resolved_paid, base_ccy, vat_rate, user_id, obj.created_by or id)
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
    return _to_order_read(obj)


async def approve_order(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, note: str | None = None,
) -> OrderRead:
    """Completes a credit sale that was held over the daily limit: posts it exactly like a normal completed sale,
    with the cash the cashier recorded, and stamps who approved it and when."""
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status != STATUS_AWAITING_APPROVAL:
        raise ValidationError("Only orders awaiting approval can be approved")
    base_ccy = await get_base_currency(db, tenant_id)
    # Price the sale again with the CURRENT VAT setting, as completing any open order does.
    gross = round(float(obj.subtotal) - float(obj.discount), 2)
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)
    obj.tax = tax
    obj.total = total
    _set_base_amounts(obj, base_ccy)
    resolved_paid = round(min(float(obj.requested_paid or 0), total), 2)
    outstanding = round(total - resolved_paid, 2)
    _require_credit_sale_fields(obj.customer_id, obj.due_date, outstanding)
    obj.credit_base = _base_value(outstanding, obj.currency_code or base_ccy, base_ccy, document_rate(obj)) if outstanding > _PAID_EPSILON else None
    obj.status = "Completed"
    obj.approved_by = user_id
    obj.approved_at = datetime.now(UTC)
    obj.approval_note = (note or "").strip() or None
    await _finalize_completed_sale(db, tenant_id, obj, resolved_paid, base_ccy, vat_rate, user_id, obj.created_by or user_id)
    await OrderRepository(db).save(obj)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.credit_approved",
        entity_type="order", entity_id=str(id),
        summary=f"Order {obj.order_number} credit approved",
        changes={"outstanding": outstanding, "credit_base": str(obj.credit_base) if obj.credit_base is not None else None, "note": obj.approval_note},
    )
    await db.commit()
    return _to_order_read(await OrderRepository(db).get_by_id_for_tenant(tenant_id, id))


async def reject_order(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, note: str | None = None,
) -> OrderRead:
    """Declines a held credit sale. Nothing was ever posted for it, so nothing needs reversing."""
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status != STATUS_AWAITING_APPROVAL:
        raise ValidationError("Only orders awaiting approval can be rejected")
    obj.status = STATUS_REJECTED
    obj.approved_by = user_id
    obj.approved_at = datetime.now(UTC)
    obj.approval_note = (note or "").strip() or None
    await OrderRepository(db).save(obj)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.credit_rejected",
        entity_type="order", entity_id=str(id), summary=f"Order {obj.order_number} credit rejected",
        changes={"note": obj.approval_note},
    )
    await db.commit()
    return _to_order_read(await OrderRepository(db).get_by_id_for_tenant(tenant_id, id))


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
            await create_order(db, tenant_id, user_id, order_data, enforce_credit_limit=False)
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
