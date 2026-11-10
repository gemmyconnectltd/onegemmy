import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import ONE, compute_settlement, to_base_amount, to_decimal
from app.core.exceptions import NotFoundError, ValidationError
from app.core.period import DatePeriod
from app.core.stock_context import set_reason
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
    if customer_id is None:
        return False
    from app.modules.tenants.models import Tenant
    customer = (await db.execute(select(Customer).where(
        Customer.tenant_id == tenant_id, Customer.id == customer_id,
    ))).scalar_one_or_none()
    if customer is None:
        raise ValidationError("Choose a customer belonging to your business")
    if customer.credit_daily_limit is not None:
        limit = customer.credit_daily_limit
    if limit is None:
        return False
    timezone = (await db.execute(select(Tenant.timezone).where(Tenant.id == tenant_id))).scalar_one()
    already = await OrderRepository(db).credit_granted_on(tenant_id, customer_id, on_day, timezone)
    return already + new_credit_base > limit


async def _exceeds_total_debt_limit(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID | None, new_credit_base: Decimal) -> bool:
    """True when this sale would take the client's TOTAL debt (everything they owe now plus this sale) past the business's limit per client.
    Switched off by the business's approval rule, and absent when no limit is set."""
    if customer_id is None:
        return False
    from app.modules.accounting.service.debt_actions import client_outstanding
    from app.modules.approvals.service import rule_on
    from app.modules.tenants.models import Tenant
    if not await rule_on(db, tenant_id, "debt_over_limit"):
        return False
    limit = (await db.execute(select(Tenant.debt_limit_per_client).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if limit is None:
        return False
    return await client_outstanding(db, tenant_id, customer_id) + new_credit_base > limit


async def _business_day(db: AsyncSession, tenant_id: uuid.UUID, moment: datetime | None) -> date | None:
    """The calendar day a moment belongs to in the business's own time zone, which is the date the books use."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    from app.modules.tenants.models import Tenant
    if moment is None:
        return None
    name = (await db.execute(select(Tenant.timezone).where(Tenant.id == tenant_id))).scalar_one_or_none() or "UTC"
    try:
        zone = ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        zone = UTC
    return (moment if moment.tzinfo else moment.replace(tzinfo=UTC)).astimezone(zone).date()


async def _credit_day(db: AsyncSession, tenant_id: uuid.UUID) -> date:
    from zoneinfo import ZoneInfo

    from app.modules.tenants.models import Tenant
    timezone = (await db.execute(select(Tenant.timezone).where(Tenant.id == tenant_id))).scalar_one()
    return datetime.now(ZoneInfo(timezone)).date()


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
    read.discount_details = [{"name": item.rule_name, "kind": item.kind, "type": item.rule_type,
        "amount": str(item.amount), "coupon_code": item.coupon_code} for item in obj.applied_discounts]
    read.salesperson_name = obj.salesperson.full_name if obj.salesperson else None
    line_discount = sum(Decimal(str(item.discount or 0)) for item in obj.items)
    read.original_subtotal = float(Decimal(str(obj.subtotal)) + line_discount)
    read.total_discount = float(Decimal(str(obj.discount)) + line_discount)
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
        set_reason("sale", reference_type="order", reference_id=getattr(item, "order_id", None))
        variant.stock = max(0, float(variant.stock) - quantity)
    elif product:
        set_reason("sale", reference_type="order", reference_id=getattr(item, "order_id", None))
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
    search: str | None = None, payment_status: str | None = None, branch_id: uuid.UUID | None = None,
    period: DatePeriod | None = None, archived: bool = False, salesperson_id: uuid.UUID | None = None,
) -> list[OrderRead]:
    items = await OrderRepository(db).list_for_tenant(tenant_id, status, offset, limit, search, payment_status, branch_id, period, archived, salesperson_id)
    return [_to_order_read(i) for i in items]


async def count_orders(
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, search: str | None = None,
    payment_status: str | None = None, branch_id: uuid.UUID | None = None, period: DatePeriod | None = None, archived: bool = False,
    salesperson_id: uuid.UUID | None = None,
) -> int:
    return await OrderRepository(db).count_for_tenant(tenant_id, status, search, payment_status, branch_id, period, archived, salesperson_id)


async def _change_sale_date(db: AsyncSession, tenant_id: uuid.UUID, obj: Order, new_at: datetime, user_id: uuid.UUID | None, user_name: str | None) -> None:
    """Move a sale to another day. The sale journal moves with it (a date correction, not a repricing); both the old and the
    new day must be in an open period, a future date is refused, and the before/after is audited."""
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.repository import TransactionRepository
    new_at = new_at if new_at.tzinfo else new_at.replace(tzinfo=UTC)
    if new_at > datetime.now(UTC) + timedelta(minutes=5):
        raise ValidationError("A sale cannot be dated in the future")
    old_at = obj.ordered_at
    if old_at is not None and new_at == old_at:
        return
    old_day, new_day = await _business_day(db, tenant_id, old_at), await _business_day(db, tenant_id, new_at)
    repo = TransactionRepository(db)
    await repo.assert_period_open(tenant_id, old_day)
    await repo.assert_period_open(tenant_id, new_day)
    obj.ordered_at = new_at
    journals = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant_id, Transaction.order_id == obj.id, Transaction.type == "sale"))).scalars().all()
    for journal in journals:
        journal.transaction_date = new_day
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.change_date", entity_type="order", entity_id=str(obj.id),
                       summary=f"Moved sale {obj.order_number} from {old_day} to {new_day}",
                       changes={"before": old_at.isoformat() if old_at else None, "after": new_at.isoformat(), "journals_moved": len(journals)})


async def correct_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data, user_id: uuid.UUID, user_name: str | None) -> OrderRead:
    """An owner's correction of a COMPLETED sale (wrong item, price, quantity, customer or discount).

    Nothing posted is edited. The old sale journal is reversed, the old lines' stock goes back, the new lines are applied (stock out, cost
    snapshot), and a fresh sale journal is posted on the same day, so the ledger shows both the mistake and the correction. Refused when
    the sale's day is in a closed period, when the new total is less than what has already been paid (reverse a payment first), for
    serial-tracked items (use a return), or when a customer would go over their debt limit."""
    from app.modules.accounting.models.account import Account
    from app.modules.accounting.models.tax import TaxCalculation
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.models.transaction_line import TransactionLine
    from app.modules.accounting.repository import TransactionRepository
    from app.modules.accounting.service.transaction import reverse_journal

    repo = OrderRepository(db)
    await repo.lock_financial_writes(tenant_id)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status != "Completed":
        raise ValidationError("Only a completed sale is corrected this way; open sales are edited normally")
    if obj.archived_at is not None:
        raise ValidationError("Restore this archived sale before correcting it")
    reason = data.reason.strip()
    day = await _business_day(db, tenant_id, obj.ordered_at)
    await TransactionRepository(db).assert_period_open(tenant_id, day)
    if data.customer_id and await CustomerRepository(db).get_by_id_for_tenant(tenant_id, data.customer_id) is None:
        raise ValidationError("Choose a customer belonging to this business")

    # Work out the new figures first, before anything is touched.
    subtotal = round(sum(item.line_total for item in data.items), 2)
    gross = round(subtotal - data.discount, 2)
    if gross < 0:
        raise ValidationError("The sale discount cannot exceed the subtotal")
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)
    paid = round(float(obj.amount_paid or 0), 2)
    if total + _PAID_EPSILON < paid:
        raise ValidationError(f"The corrected total ({total}) is less than the {paid} already paid. Reverse a payment first, or record a return.")
    old_total = float(obj.total)
    increase = round(total - max(old_total, paid), 2)
    customer_id = data.customer_id if data.customer_id is not None else obj.customer_id
    if increase > _PAID_EPSILON and customer_id:
        base_ccy = await get_base_currency(db, tenant_id)
        if await _exceeds_total_debt_limit(db, tenant_id, customer_id, _base_value(increase, obj.currency_code or base_ccy, base_ccy, obj.exchange_rate or Decimal(1))):
            raise ValidationError("This correction takes the customer over the debt limit. Use the approval flow for the extra credit.")

    # The journal being replaced, and how its payment side was split (so the money already counted stays where it was).
    journals = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant_id, Transaction.order_id == obj.id, Transaction.type == "sale", Transaction.status == "Posted").order_by(Transaction.created_at))).scalars().all()
    reversed_refs = set((await db.execute(select(Transaction.client_reference).where(Transaction.tenant_id == tenant_id, Transaction.client_reference.like("rev:%")))).scalars().all())
    live = [j for j in journals if f"rev:{j.id}" not in reversed_refs]
    if not live:
        raise ValidationError("This sale has no posted journal to correct. Run the reconciliation report for it.")
    original = live[-1]
    lines = (await db.execute(select(TransactionLine, Account).join(Account, Account.id == TransactionLine.account_id).where(TransactionLine.transaction_id == original.id))).all()
    method_lines = [(account.code, float(line.amount)) for line, account in lines if line.type == "debit" and account.code in {"1000", "1010", "1020"}]
    method_code, paid_in_journal = (method_lines[0] if method_lines else (None, 0.0))
    method = {"1000": "cash", "1010": "bank", "1020": "mobile"}.get(method_code)

    # Old lines out: stock back (serial-tracked items are not corrected this way).
    old_items = list(obj.items)
    for old in old_items:
        product = await db.get(Product, old.product_id) if old.product_id else None
        if product is not None and product.tracks_serials:
            raise ValidationError(f"'{old.product_name}' is serial-tracked. Record a return for it instead of correcting the sale.")
        target = await db.get(ProductVariant, old.variant_id) if old.variant_id else product
        if target is not None:
            set_reason("customer_return", reference_type="order", reference_id=obj.id, note="Sale corrected")
            target.stock = float(target.stock) + float(old.quantity)
    # New lines in: validate, take stock out, snapshot cost.
    await ProductRepository(db).lock_stock(tenant_id, {i.product_id for i in data.items if i.product_id}, {i.variant_id for i in data.items if i.variant_id})
    new_rows: list[OrderItem] = []
    cogs_total = 0.0
    for item_data in data.items:
        variant = product = None
        name, sku, attributes = item_data.product_name, item_data.sku, item_data.variant_attributes
        if item_data.variant_id:
            variant = await db.get(ProductVariant, item_data.variant_id)
            product = await db.get(Product, variant.product_id) if variant else None
            if variant is None or product is None or product.tenant_id != tenant_id:
                raise ValidationError("A line refers to a variant that is not in this business")
            name, sku, attributes = product.name, variant.sku or product.sku, variant.attributes
        elif item_data.product_id:
            product = await db.get(Product, item_data.product_id)
            if product is None or product.tenant_id != tenant_id:
                raise ValidationError("A line refers to a product that is not in this business")
            if product.has_variants:
                raise ValidationError(f"Product '{product.name}' has variants. Pick a specific variant.")
        else:
            raise ValidationError(f"Item '{item_data.product_name}' must reference a product or variant")
        if product is not None and product.tracks_serials:
            raise ValidationError(f"'{product.name}' is serial-tracked. Record a new sale for it instead.")
        row = OrderItem(order_id=obj.id, product_id=variant.product_id if variant else item_data.product_id, variant_id=variant.id if variant else None,
                        product_name=name, sku=sku, variant_attributes=attributes, unit_price=item_data.unit_price, quantity=item_data.quantity,
                        discount=item_data.discount, line_total=item_data.line_total)
        cogs_total += _complete_sale_item(row, name, item_data.quantity, variant, product)
        new_rows.append(row)

    before = {"total": old_total, "subtotal": float(obj.subtotal), "discount": float(obj.discount), "customer_id": str(obj.customer_id) if obj.customer_id else None,
              "lines": [{"name": i.product_name, "qty": float(i.quantity), "price": float(i.unit_price)} for i in old_items]}
    reversal = await reverse_journal(db, tenant_id, user_id, original, f"sale corrected: {reason}", posting_date=day)
    for old in old_items:
        await db.delete(old)
    await db.flush()
    for row in new_rows:
        db.add(row)
    obj.subtotal, obj.discount, obj.tax, obj.total = subtotal, data.discount, tax, total
    obj.customer_id = customer_id
    if data.notes is not None:
        obj.notes = data.notes
    base_ccy = await get_base_currency(db, tenant_id)
    _set_base_amounts(obj, base_ccy)
    await db.flush()
    new_txn_id = await create_sale_transaction(
        db, tenant_id, user_id, obj.id, float(obj.base_total), obj.order_number, cogs=round(cogs_total, 2), tax=float(obj.base_tax),
        payment_method=method, amount_paid=paid_in_journal, posting_date=day, branch_id=obj.branch_id, allow_repost=True)
    for payment in (await db.execute(select(OrderPayment).where(OrderPayment.order_id == obj.id, OrderPayment.accounting_transaction_id == original.id))).scalars().all():
        payment.accounting_transaction_id = new_txn_id
    tax_rows = (await db.execute(select(TaxCalculation).where(TaxCalculation.tenant_id == tenant_id, TaxCalculation.reference_type == "sale", TaxCalculation.reference_id == str(obj.id)))).scalars().all()
    for record in tax_rows:
        record.tax_amount, record.taxable_amount, record.tax_rate = round(float(obj.base_tax), 2), round(float(obj.base_total) - float(obj.base_tax), 2), vat_rate
    if not tax_rows:
        await _record_vat(db, tenant_id, obj.id, float(obj.base_tax), float(obj.base_total), vat_rate)
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.correct", entity_type="order", entity_id=str(obj.id),
                       summary=f"Corrected sale {obj.order_number}: {reason}",
                       changes={"before": before, "after": {"total": total, "subtotal": subtotal, "discount": data.discount, "customer_id": str(customer_id) if customer_id else None,
                                                            "lines": [{"name": r.product_name, "qty": float(r.quantity), "price": float(r.unit_price)} for r in new_rows]},
                                "reason": reason, "reversal_journal": reversal.reference, "original_journal": original.reference})
    await db.commit()
    return _to_order_read(await repo.get_by_id_for_tenant(tenant_id, id))


async def void_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, reason: str) -> OrderRead:
    """Cancel a completed sale that should never have happened (wrong customer, duplicate, test).

    Nothing is deleted: the sale journal is reversed on the sale's own day, every later payment is reversed (money back to the customer),
    stock goes back on the shelf, the VAT record is voided and the sale becomes Cancelled with who/when/why. Refused for a closed period
    and for serial-tracked items (use a return)."""
    from app.modules.accounting.models.tax import TaxCalculation
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.repository import TransactionRepository
    from app.modules.accounting.service.transaction import (
        create_payment_reversal_transaction,
        reverse_journal,
    )

    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationError("A reason is required to void a sale")
    repo = OrderRepository(db)
    await repo.lock_financial_writes(tenant_id)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status == "Cancelled":
        raise ValidationError("This sale is already cancelled")
    if obj.status != "Completed":
        raise ValidationError("Only a completed sale is voided. Open sales can simply be set to Cancelled")
    day = await _business_day(db, tenant_id, obj.ordered_at)
    await TransactionRepository(db).assert_period_open(tenant_id, day)
    items = list(obj.items)
    for item in items:
        product = await db.get(Product, item.product_id) if item.product_id else None
        if product is not None and product.tracks_serials:
            raise ValidationError(f"'{item.product_name}' is serial-tracked. Record a return for it instead of voiding the sale.")
    journals = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant_id, Transaction.order_id == obj.id, Transaction.type == "sale", Transaction.status == "Posted").order_by(Transaction.created_at))).scalars().all()
    reversed_refs = set((await db.execute(select(Transaction.client_reference).where(Transaction.tenant_id == tenant_id, Transaction.client_reference.like("rev:%")))).scalars().all())
    live = [j for j in journals if f"rev:{j.id}" not in reversed_refs]
    # Money taken after the sale (its own journal each) goes back first; the checkout payment sits inside the sale journal and is undone by reversing it.
    now = datetime.now(UTC)
    for payment in (await db.execute(select(OrderPayment).where(OrderPayment.order_id == obj.id, OrderPayment.status == "Completed"))).scalars().all():
        inside_sale_journal = payment.accounting_transaction_id is not None and any(j.id == payment.accounting_transaction_id for j in live)
        if not inside_sale_journal:
            base_cash = payment.base_amount if payment.base_amount is not None else payment.amount
            base_clears = payment.base_applied_amount if payment.base_applied_amount is not None else base_cash
            await create_payment_reversal_transaction(db, tenant_id, user_id, obj.id, base_cash, payment.reference, payment.payment_method, ar_amount=base_clears)
        payment.status, payment.reversed_at, payment.reversed_by, payment.reversal_reason = "Reversed", now, user_id, f"Sale voided: {reason}"
    references = []
    for journal in live:
        references.append((await reverse_journal(db, tenant_id, user_id, journal, f"sale voided: {reason}", posting_date=day)).reference)
    for item in items:
        target = await db.get(ProductVariant, item.variant_id) if item.variant_id else (await db.get(Product, item.product_id) if item.product_id else None)
        if target is not None:
            set_reason("customer_return", reference_type="order", reference_id=obj.id, note="Sale voided")
            target.stock = float(target.stock) + float(item.quantity)
    for record in (await db.execute(select(TaxCalculation).where(TaxCalculation.tenant_id == tenant_id, TaxCalculation.reference_type == "sale", TaxCalculation.reference_id == str(obj.id)))).scalars().all():
        record.status = "Void"
    before = {"status": obj.status, "total": float(obj.total), "paid": float(obj.amount_paid or 0)}
    obj.status = "Cancelled"
    from app.modules.discounts.service import release_coupon_usage
    await release_coupon_usage(db, tenant_id, obj.id)
    obj.amount_paid = 0
    obj.notes = f"{obj.notes + chr(10) if obj.notes else ''}VOIDED: {reason}"
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.void", entity_type="order", entity_id=str(obj.id),
                       summary=f"Voided sale {obj.order_number}: {reason}", changes={"before": before, "after": {"status": "Cancelled"}, "reason": reason, "reversal_journals": references})
    await db.commit()
    return _to_order_read(await repo.get_by_id_for_tenant(tenant_id, id))


async def archive_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, reason: str, restore: bool = False) -> OrderRead:
    """Hide a sale from the default list (or bring it back). The sale, its payments and its ledger entries are untouched."""
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if restore == (obj.archived_at is None):
        raise ValidationError("This sale is not archived" if restore else "This sale is already archived")
    if not restore and len((reason or "").strip()) < 3:
        raise ValidationError("A reason is required to archive a sale")
    obj.archived_at = None if restore else datetime.now(UTC)
    obj.archived_by = None if restore else user_id
    obj.archive_reason = None if restore else reason.strip()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.restore" if restore else "order.archive",
                       entity_type="order", entity_id=str(obj.id), summary=f"{'Restored' if restore else 'Archived'} sale {obj.order_number}",
                       changes={"reason": reason} if reason else None)
    await db.commit()
    return _to_order_read(await OrderRepository(db).get_by_id_for_tenant(tenant_id, id))


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


# For now every till user may record a sale for an earlier day. Set False to require approval authority on sales again.
BACKDATING_OPEN_TO_ALL = True


async def require_backdating_allowed(db: AsyncSession, user, ordered_at: datetime) -> None:
    """Recording a sale for an earlier day than today changes past figures, so it needs approval authority on sales (owners, admins and managers hold it; cashiers do not)."""
    from zoneinfo import ZoneInfo

    from app.core.exceptions import ForbiddenError
    from app.modules.tenants.models import Tenant
    if BACKDATING_OPEN_TO_ALL or user.is_superuser or "orders:approve" in user.permissions_names:
        return
    zone = ZoneInfo((await db.execute(select(Tenant.timezone).where(Tenant.id == user.tenant_id))).scalar_one() or "UTC")
    when = ordered_at if ordered_at.tzinfo else ordered_at.replace(tzinfo=UTC)
    if when.astimezone(zone).date() < datetime.now(zone).date():
        raise ForbiddenError("Recording a sale for an earlier date needs a manager. Ask someone with approval authority on sales.")


async def policy_on(db: AsyncSession, tenant_id: uuid.UUID, key: str) -> bool:
    """A business policy that is OFF unless the business switched it on (Business Settings -> Approval rules). Existing businesses are untouched."""
    from app.modules.tenants.models import Tenant
    rules = (await db.execute(select(Tenant.approval_rules).where(Tenant.id == tenant_id))).scalar_one_or_none() or {}
    return rules.get(key) is True


async def own_sales_scope(db: AsyncSession, user) -> uuid.UUID | None:
    """With the `own_sales_only` policy, anyone who cannot approve sales sees only the sales they are the salesperson on."""
    if user.is_superuser or "orders:approve" in user.permissions_names:
        return None
    return user.id if await policy_on(db, user.tenant_id, "own_sales_only") else None


async def sale_needs_approval(db: AsyncSession, tenant_id: uuid.UUID, can_approve_sale: bool) -> bool:
    """Whether a sale entered now must wait for an approver. Only when the business switched `sale_approval` on; approvers may complete their
    own sales unless the business also switched `sale_no_self_approval` on."""
    if not await policy_on(db, tenant_id, "sale_approval"):
        return False
    return not (can_approve_sale and not await policy_on(db, tenant_id, "sale_no_self_approval"))


async def _check_decider(db: AsyncSession, obj: Order, user_id: uuid.UUID, can_approve_sale: bool, can_approve_credit: bool) -> None:
    from app.core.exceptions import ForbiddenError
    if obj.held_reason == "policy":
        if not can_approve_sale:
            raise ForbiddenError("Permission required: orders:approve")
        if user_id in (obj.created_by, obj.salesperson_id) and await policy_on(db, obj.tenant_id, "sale_no_self_approval"):
            raise ForbiddenError("This business does not allow approving a sale you made or entered. Ask another approver.")
    elif not can_approve_credit:
        raise ForbiddenError("Permission required: credit:approve")


async def resolve_salesperson(db: AsyncSession, tenant_id: uuid.UUID, chosen: uuid.UUID | None, entered_by: uuid.UUID) -> uuid.UUID:
    """The salesperson must be an active user of this business. None means whoever is entering the sale, never the cashier taking payment later."""
    from app.modules.tenants.models import User
    wanted = chosen or entered_by
    user = (await db.execute(select(User).where(User.id == wanted, User.tenant_id == tenant_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise ValidationError("Choose an active member of this business as the salesperson")
    return wanted


async def change_salesperson(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, salesperson_id: uuid.UUID, reason: str, user_id: uuid.UUID, user_name: str | None) -> OrderRead:
    """Corrects who is credited with a sale. Money and stock are untouched; the change and its reason are audited."""
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    new_id = await resolve_salesperson(db, tenant_id, salesperson_id, user_id)
    before = obj.salesperson_id
    if before == new_id:
        return _to_order_read(obj)
    obj.salesperson_id = new_id
    await OrderRepository(db).save(obj)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="order.salesperson_changed",
        entity_type="order", entity_id=str(id), summary=f"Order {obj.order_number} salesperson changed",
        changes={"before": str(before) if before else None, "after": str(new_id), "reason": reason},
    )
    await db.commit()
    return _to_order_read(await OrderRepository(db).get_by_id_for_tenant(tenant_id, id))


async def create_order(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: OrderCreate,
    active_branch_id: uuid.UUID | None = None,
    can_approve_credit: bool = False,
    can_sell_credit: bool = True,
    can_approve_sale: bool = False,
    preserve_quotation_prices: bool = False,
) -> OrderRead:
    repo = OrderRepository(db)
    extra_payments: list = []
    if data.payments:
        # A split: the first payment is the sale's checkout payment, the others are recorded against the same sale below.
        first, *extra_payments = data.payments
        data = data.model_copy(update={"payment_method": first.method, "amount_paid": first.amount, "amount_tendered": first.tendered,
                                       "payment_reference": first.reference})
    await repo.lock_financial_writes(tenant_id)

    # Idempotency: replaying a client order id (e.g. an offline sale being
    # synced after a retry) must return the existing order, never double-create.
    if data.client_order_id:
        existing = await repo.find_by_client_order_id(tenant_id, data.client_order_id)
        if existing is not None:
            if active_branch_id and existing.branch_id != active_branch_id:
                raise ValidationError("This sale reference belongs to another branch")
            return _to_order_read(existing)

    if data.customer_id and await CustomerRepository(db).get_by_id_for_tenant(tenant_id, data.customer_id) is None:
        raise ValidationError("Choose a customer belonging to this business")
    salesperson_id = await resolve_salesperson(db, tenant_id, data.salesperson_id, user_id)
    order_number = await repo.next_order_number(tenant_id)

    # Currency context, settled before any amount is stored: the order's own currency, the rate that
    # converts it to the tenant's base currency (frozen on the order), and the base currency itself.
    effective_at = (data.ordered_at if data.ordered_at and data.ordered_at.tzinfo else (
        data.ordered_at.replace(tzinfo=UTC) if data.ordered_at else datetime.now(UTC)
    ))
    if data.ordered_at is not None and effective_at > datetime.now(UTC) + timedelta(minutes=5):
        raise ValidationError("A sale can't be dated in the future. Choose today or an earlier date.")
    if data.due_date and data.due_date < effective_at.date():
        raise ValidationError("Invoice due date cannot precede its issue date")
    currency_code, fx_rate, base_ccy = await resolve_document_currency(
        db, tenant_id, data.currency_code, data.exchange_rate, at=effective_at,
    )

    from app.modules.discounts import settings as discount_settings
    from app.modules.discounts.schemas import PriceIn, PriceItem
    from app.modules.discounts.service import record_sale, validate_checkout
    from app.modules.tenants.service import get_user_by_id_raw

    pricing = None
    discount_config = await discount_settings.load(db, tenant_id)
    if not preserve_quotation_prices and (discount_config["enabled"] or data.discount or any(i.discount for i in data.items) or data.coupon_codes or data.manual_discount or data.discount_approval_id):
        if currency_code != base_ccy:
            raise ValidationError("Discount pricing currently requires the business base currency")
        pricing_user = await get_user_by_id_raw(db, tenant_id, user_id)
        pricing_branch = await _resolve_order_branch_id(db, tenant_id, active_branch_id, data.branch_id)
        manual = data.manual_discount
        if data.discount:
            if manual:
                raise ValidationError("Use one order-level manual discount")
            from app.modules.discounts.schemas import ManualDiscount
            manual = ManualDiscount(kind="fixed", value=Decimal(str(data.discount)))
        request = PriceIn(items=[PriceItem(product_id=i.product_id, variant_id=i.variant_id,
            unit_price=Decimal(str(i.unit_price)), quantity=Decimal(str(i.quantity)),
            discount=Decimal(str(i.discount))) for i in data.items], customer_id=data.customer_id,
            branch_id=pricing_branch, channel=data.pricing_channel, coupon_codes=data.coupon_codes,
            manual_discount=manual, manual_reason=data.manual_discount_reason, discount_approval_id=data.discount_approval_id)
        pricing = await validate_checkout(db, pricing_user, request, pricing_branch)
        priced = pricing[0]
        if data.expected_pricing_hash:
            from app.modules.discounts.service import pricing_hash
            if data.expected_pricing_hash != pricing_hash(priced):
                raise ValidationError("Discount pricing changed; review the refreshed cart before charging")
        data = data.model_copy(update={"discount": 0, "items": [
            i.model_copy(update={"discount": float(priced.lines[n]["discount"]),
                                 "line_total": float(priced.lines[n]["net"])})
            for n, i in enumerate(data.items)]})

    subtotal = sum(item.line_total for item in data.items)
    gross = round(subtotal - data.discount, 2)
    if gross < 0:
        raise ValidationError("The sale discount cannot exceed the subtotal")
    tax, total, vat_rate = await _apply_vat(db, tenant_id, gross)

    resolved_paid = _resolve_amount_paid(data.amount_paid, data.amount_tendered, total) if data.status == "Completed" else 0.0
    if data.payments:
        if data.status != "Completed":
            raise ValidationError("Payments can only be taken on a completed sale")
        for entry in data.payments:
            if entry.method in ("mobile", "card", "bank") and not (entry.reference or "").strip():
                name = {"mobile": "mobile money", "card": "card", "bank": "bank transfer"}[entry.method]
                raise ValidationError(f"Enter the transaction reference for the {name} payment, so it can be matched to the provider's record")
        entered = round(sum(entry.amount for entry in data.payments), 2)
        if entered > total + _PAID_EPSILON:
            raise ValidationError(f"The payments add up to {entered}, more than the sale total of {total}")
    extras_total = round(sum(entry.amount for entry in extra_payments), 2)
    outstanding = round(total - resolved_paid - extras_total, 2)
    if outstanding > _PAID_EPSILON and data.status == "Completed" and not can_sell_credit:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("Selling on credit needs the credit permission. Take the full payment, or ask a manager.")
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
        if await _exceeds_daily_credit_limit(db, tenant_id, data.customer_id, credit_base, await _credit_day(db, tenant_id)) or \
                await _exceeds_total_debt_limit(db, tenant_id, data.customer_id, credit_base):
            if can_approve_credit:
                over_limit_by_approver = True
            else:
                hold_for_approval = True
    held_reason = "credit" if hold_for_approval else None
    if data.status == "Completed" and not hold_for_approval and await sale_needs_approval(db, tenant_id, can_approve_sale):
        hold_for_approval, held_reason = True, "policy"
    if hold_for_approval and held_reason == "policy" and extra_payments:
        raise ValidationError("This business approves sales before payment. Submit the sale for approval; payments are taken once it is approved.")
    if hold_for_approval and extra_payments:
        raise ValidationError("This credit sale needs approval and can't be held with several payments. Take it as one payment, or ask a manager to approve the credit.")
    completing = data.status == "Completed" and not hold_for_approval

    resolved_branch_id = await _resolve_order_branch_id(db, tenant_id, active_branch_id, data.branch_id)

    order = Order(
        tenant_id=tenant_id,
        order_number=order_number,
        customer_id=data.customer_id,
        deal_id=data.deal_id,
        branch_id=resolved_branch_id,
        created_by=user_id,
        salesperson_id=salesperson_id,
        status=STATUS_AWAITING_APPROVAL if hold_for_approval else data.status,
        requested_paid=resolved_paid if hold_for_approval else None,
        held_reason=held_reason,
        credit_base=None if hold_for_approval else credit_base,
        credit_granted_at=datetime.now(UTC) if credit_base and not hold_for_approval else None,
        subtotal=subtotal,
        approved_by=user_id if over_limit_by_approver else None,
        approved_at=datetime.now(UTC) if over_limit_by_approver else None,
        approval_note="Credit granted directly by an authorized approver" if over_limit_by_approver else None,
        discount=data.discount,
        tax=tax,
        total=total,
        notes=data.notes,
        client_order_id=data.client_order_id,
        payment_method="split" if len({e.method for e in (data.payments or [])}) > 1 else data.payment_method,
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


    if completing:
        await ProductRepository(db).lock_stock(tenant_id,
            {item.product_id for item in data.items if item.product_id},
            {item.variant_id for item in data.items if item.variant_id})
    created_items = []
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

        unit_cost = Decimal(str(variant.cost if variant else product.cost))
        if _base_value(item_data.unit_price, currency_code, base_ccy, fx_rate) < unit_cost:
            raise ValidationError(f"The selling price for '{product_name}' cannot be below unit cost")

        if data.pricing_channel == "pos":
            effective_line = Decimal(str(item_data.line_total))
            if data.discount and subtotal:
                effective_line *= (Decimal(str(subtotal)) - Decimal(str(data.discount))) / Decimal(str(subtotal))
            cost_total = unit_cost * Decimal(str(item_data.quantity))
            if _base_value(effective_line, currency_code, base_ccy, fx_rate) < cost_total:
                raise ValidationError(f"The selling price for '{product_name}' after discounts cannot be below unit cost")

        item = OrderItem(
            id=uuid.uuid4(),
            order_id=order.id,
            product_id=variant.product_id if variant else item_data.product_id,
            variant_id=variant.id if variant else item_data.variant_id,
            product_name=product_name,
            requested_serial_ids=[str(id) for id in item_data.serial_ids] if item_data.serial_ids else None,
            sku=sku,
            variant_attributes=variant_attributes,
            unit_price=item_data.unit_price,
            quantity=item_data.quantity,
            discount=item_data.discount,
            line_total=item_data.line_total,
        )
        db.add(item)
        created_items.append(item)

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

    if pricing:
        await db.flush()
        await record_sale(db, pricing_user, order, pricing, created_items)

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
            posting_date=await _business_day(db, tenant_id, order.ordered_at), branch_id=resolved_branch_id,
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
                branch_id=resolved_branch_id,
                amount=resolved_paid,
                payment_method=data.payment_method,
                reference_number=data.payment_reference,
                status="Completed",
                paid_at=order.ordered_at,
                received_by=user_id,
                accounting_transaction_id=sale_txn_id,
                **pay_fields,
            )
            db.add(payment)
            order.amount_paid = pay_fields["applied_amount"]
            await db.flush()
            # The other payments of a split are recorded against this same sale, in this same transaction.
            if extra_payments:
                from app.modules.sales.schemas.order_payment import OrderPaymentCreate
                from app.modules.sales.service.order_payment import record_payment
                for number, entry in enumerate(extra_payments, start=1):
                    await record_payment(db, tenant_id, user_id, None, order.id, OrderPaymentCreate(
                        amount=entry.amount, payment_method=entry.method, reference_number=entry.reference, paid_at=order.ordered_at,
                        branch_id=resolved_branch_id, client_payment_id=f"{data.client_order_id}:p{number}" if data.client_order_id else None,
                    ), commit=False)

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
    await ProductRepository(db).lock_stock(tenant_id,
        {item.product_id for item in obj.items if item.product_id},
        {item.variant_id for item in obj.items if item.variant_id})
    cogs_total = 0.0
    for item in obj.items:
        cogs_total += _complete_sale_item(item, item.product_name, float(item.quantity), item.variant, item.product)
        await _assign_serials(db, tenant_id, item.product,
            [uuid.UUID(id) for id in item.requested_serial_ids] if item.requested_serial_ids else None,
            float(item.quantity), item.id)
    # The rate frozen on the order (set at creation or while it was open) now becomes final:
    # everything below is posted in the tenant's base currency at that rate.
    base_total, base_tax = float(obj.base_total), float(obj.base_tax)
    pay_fields, base_paid = _checkout_payment(obj, base_ccy, resolved_paid) if resolved_paid > 0 else ({}, 0.0)
    await _bump_revenue_targets(db, tenant_id, base_total)
    await _bump_order_targets(db, tenant_id)
    sale_txn_id = await create_sale_transaction(
        db, tenant_id, txn_user_id, obj.id, base_total, obj.order_number, cogs=round(cogs_total, 2), tax=base_tax,
        payment_method=obj.payment_method, amount_paid=base_paid,
        posting_date=await _business_day(db, tenant_id, obj.ordered_at), branch_id=obj.branch_id,
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


async def update_order(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: OrderUpdate, user_id: uuid.UUID | None = None, user_name: str | None = None,
                       can_approve_sale: bool = False) -> OrderRead:
    await OrderRepository(db).lock_financial_writes(tenant_id)
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status in ("Completed", STATUS_REJECTED):
        protected = set(data.model_fields_set) - {"notes", "due_date", "ordered_at"}
        if protected:
            raise ValidationError("Posted or rejected sales cannot be repriced or reopened; use a return or a new sale")
    was_completed = obj.status == "Completed"
    before = obj.status
    update_fields = data.model_dump(exclude_unset=True)
    from app.modules.discounts.models import AppliedDiscount
    if data.discount is not None and Decimal(str(data.discount)) != Decimal(str(obj.discount)):
        raise ValidationError("Reprice discounts through a new sale or the audited correction workflow")
    frozen_discount = await db.scalar(select(AppliedDiscount.id).where(
        AppliedDiscount.tenant_id == tenant_id, AppliedDiscount.order_id == obj.id,
    ).limit(1))
    if frozen_discount and any(key in update_fields and str(update_fields[key]) != str(getattr(obj, key))
                               for key in ("customer_id", "branch_id", "currency_code", "exchange_rate")):
        raise ValidationError("Discount pricing is bound to this customer, branch and currency; create a replacement sale")

    if data.ordered_at is not None:
        await _change_sale_date(db, tenant_id, obj, data.ordered_at, user_id, user_name)
    if data.due_date and data.due_date < obj.ordered_at.date():
        raise ValidationError("Invoice due date cannot precede its issue date")
    # Approval is a decision, not an edit: an order held for approval can only leave that state through the
    # approve/reject endpoints (credit:approve), and nobody can PATCH an order into or out of it.
    new_status = update_fields.get("status")
    if new_status in (STATUS_AWAITING_APPROVAL, STATUS_REJECTED) or (
        obj.status == STATUS_AWAITING_APPROVAL and new_status not in (None, STATUS_AWAITING_APPROVAL)
    ):
        raise ValidationError("Orders awaiting approval can only be approved or rejected by someone with credit approval rights")
    if data.customer_id and await CustomerRepository(db).get_by_id_for_tenant(tenant_id, data.customer_id) is None:
        raise ValidationError("Choose a customer belonging to this business")
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
    update_fields.pop("ordered_at", None)  # handled above, with its ledger and audit effects
    for field, value in update_fields.items():
        setattr(obj, field, value)
    if obj.status == "Cancelled" and before != "Cancelled":
        from app.modules.discounts.service import release_coupon_usage
        await release_coupon_usage(db, tenant_id, obj.id)
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

        if await sale_needs_approval(db, tenant_id, can_approve_sale):
            obj.status = STATUS_AWAITING_APPROVAL
            obj.held_reason = "policy"
            obj.requested_paid = resolved_paid
            obj.credit_base = None
        elif outstanding > _PAID_EPSILON and await _exceeds_daily_credit_limit(
            db, tenant_id, obj.customer_id, obj.credit_base, await _credit_day(db, tenant_id),
        ):
            obj.status = STATUS_AWAITING_APPROVAL
            obj.held_reason = "credit"
            obj.requested_paid = resolved_paid
            obj.credit_base = None
        else:
            obj.credit_granted_at = datetime.now(UTC) if obj.credit_base else None
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
    can_approve_sale: bool = True, can_approve_credit: bool = True,
) -> OrderRead:
    """Completes a credit sale that was held over the daily limit: posts it exactly like a normal completed sale,
    with the cash the cashier recorded, and stamps who approved it and when."""
    await OrderRepository(db).lock_financial_writes(tenant_id)
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status != STATUS_AWAITING_APPROVAL:
        raise ValidationError("Only orders awaiting approval can be approved")
    await _check_decider(db, obj, user_id, can_approve_sale, can_approve_credit)
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
    obj.credit_granted_at = datetime.now(UTC)
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
    can_approve_sale: bool = True, can_approve_credit: bool = True,
) -> OrderRead:
    """Declines a held credit sale. Nothing was ever posted for it, so nothing needs reversing."""
    await OrderRepository(db).lock_financial_writes(tenant_id)
    obj = await OrderRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Order not found")
    if obj.status != STATUS_AWAITING_APPROVAL:
        raise ValidationError("Only orders awaiting approval can be rejected")
    await _check_decider(db, obj, user_id, can_approve_sale, can_approve_credit)
    if obj.held_reason == "policy" and len((note or "").strip()) < 3:
        raise ValidationError("Give a reason for rejecting the sale")
    obj.status = STATUS_REJECTED
    from app.modules.discounts.service import release_coupon_usage
    await release_coupon_usage(db, tenant_id, obj.id)
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
    await OrderRepository(db).lock_financial_writes(tenant_id)
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


async def bulk_create_orders(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: OrderBulkCreate, active_branch_id: uuid.UUID | None = None) -> OrderBulkResult:
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
            await create_order(db, tenant_id, user_id, order_data, active_branch_id)
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
