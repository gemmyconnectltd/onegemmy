"""End-to-end multi-currency behaviour through the real services and ledger, on a real database.

Every test runs inside a rolled-back transaction (see conftest.py), so nothing persists."""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal as D

import pytest
from sqlalchemy import delete, func, select, update

from app.core.cache import invalidate_cache
from app.core.currency import CurrencyError, MissingExchangeRateError, UnsupportedCurrencyError
from app.core.exceptions import ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.schemas import ExpenseCreate
from app.modules.accounting.service import expense as expense_service
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.currency import service as currency_service
from app.modules.currency.models import Currency, ExchangeRate
from app.modules.currency.schemas import ExchangeRateCreate
from app.modules.inventory.models.product import Product
from app.modules.procurement.schemas import PurchaseCreate
from app.modules.procurement.schemas.purchase import PurchaseItemCreate
from app.modules.procurement.schemas.supplier_bill import SupplierPaymentCreate
from app.modules.procurement.service import purchase as purchase_service
from app.modules.procurement.service import supplier_bill as bill_service
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.schemas import (
    OrderCreate,
    OrderItemCreate,
    OrderPaymentCreate,
    OrderPaymentReverse,
    ReturnCreate,
)
from app.modules.sales.schemas.return_item import ReturnItemCreate
from app.modules.sales.service import order as order_service
from app.modules.sales.service import order_payment as payment_service
from app.modules.sales.service import return_ as return_service
from app.modules.tenants.models import Tenant, User

pytestmark = pytest.mark.db


@pytest.fixture(autouse=True)
async def _isolate_from_platform_rates(db):
    """The dev database may hold real platform exchange rates; these tests must not depend on them.
    Cleared inside the test's own transaction, which is rolled back afterwards."""
    await db.execute(delete(ExchangeRate).where(ExchangeRate.tenant_id.is_(None)))
    await db.flush()


# ── builders ──────────────────────────────────────────────────────────────────

async def make_tenant(db, currency="RWF", country=None):
    t = Tenant(name=f"T-{uuid.uuid4().hex[:6]}", slug=f"t-{uuid.uuid4().hex[:10]}", currency=currency, country=country)
    db.add(t)
    await db.flush()
    u = User(email=f"{uuid.uuid4().hex[:8]}@test.local", hashed_password="x", full_name="Tester", tenant_id=t.id, role="owner")
    db.add(u)
    await db.flush()
    await seed_default_accounts(db, t.id)
    return t, u


async def make_product(db, tenant, price=1000, cost=400, stock=1000):
    p = Product(tenant_id=tenant.id, name="Widget", sku=f"W-{uuid.uuid4().hex[:6]}", price=price, cost=cost, stock=stock)
    db.add(p)
    await db.flush()
    return p


async def make_customer(db, tenant):
    c = Customer(tenant_id=tenant.id, name="Buyer")
    db.add(c)
    await db.flush()
    return c


async def place_order(db, t, u, product, *, unit_price=1000, qty=1, currency=None, rate=None, paid=None, customer=None, status="Completed"):
    data = OrderCreate(
        status=status, customer_id=customer.id if customer else None, amount_paid=paid,
        due_date=datetime.now(UTC).date() + timedelta(days=30) if customer else None,
        currency_code=currency, exchange_rate=rate,
        payment_method="cash",
        items=[OrderItemCreate(product_id=product.id, product_name=product.name, unit_price=unit_price, quantity=qty)],
    )
    return await order_service.create_order(db, t.id, u.id, data)


async def pay(db, t, u, order_id, amount, *, currency=None, rate=None):
    return await payment_service.record_payment(
        db, t.id, u.id, "Tester", order_id,
        OrderPaymentCreate(amount=amount, currency_code=currency, exchange_rate=rate, payment_method="cash"),
    )


async def balances(db, tenant_id):
    """account code -> (debits, credits) across every ledger line of the tenant."""
    rows = (await db.execute(
        select(Account.code, TransactionLine.type, func.sum(TransactionLine.amount))
        .join(TransactionLine, TransactionLine.account_id == Account.id)
        .join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.tenant_id == tenant_id).group_by(Account.code, TransactionLine.type)
    )).all()
    out: dict[str, list[D]] = {}
    for code, typ, amount in rows:
        out.setdefault(code, [D(0), D(0)])[0 if typ == "debit" else 1] += D(amount)
    return {k: tuple(v) for k, v in out.items()}


def net(bal, code):
    d, c = bal.get(code, (D(0), D(0)))
    return d - c


async def assert_ledger_balanced(db, tenant_id):
    txns = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant_id))).scalars().all()
    assert txns, "expected ledger entries"
    for txn in txns:
        lines = (await db.execute(select(TransactionLine).where(TransactionLine.transaction_id == txn.id))).scalars().all()
        debit = sum(D(l.amount) for l in lines if l.type == "debit")
        credit = sum(D(l.amount) for l in lines if l.type == "credit")
        assert debit == credit, f"{txn.type} {txn.reference} unbalanced: Dr {debit} / Cr {credit}"


async def add_rate(db, tenant, base, quote, rate, when=None, user=None):
    row = await currency_service.create_rate(
        db, tenant.id if tenant else None, user.id if user else None,
        ExchangeRateCreate(base_currency=base, quote_currency=quote, rate=rate, effective_at=when),
    )
    await db.flush()
    return row


# ── 1. existing RWF behaviour is unchanged ────────────────────────────────────

async def test_rwf_tenant_rwf_order_is_unchanged_and_stamped_with_its_currency(db):
    t, u = await make_tenant(db, "RWF")
    p = await make_product(db, t)
    order = await place_order(db, t, u, p, unit_price=118000, qty=1)

    assert order.currency_code == "RWF" and order.exchange_rate == D(1)
    assert order.total == 118000 and order.base_total == D(118000) and order.base_tax == order.tax
    assert order.payment_status == "Paid" and order.outstanding_balance == 0
    pay_row = order.payments[0]
    assert (pay_row.currency_code, pay_row.exchange_rate) == ("RWF", D(1))
    assert pay_row.base_amount == pay_row.applied_amount == D(118000)

    await assert_ledger_balanced(db, t.id)
    bal = await balances(db, t.id)
    assert net(bal, "1000") == D(118000)                    # cash in, whole amount
    assert "4900" not in bal and "5950" not in bal           # no FX anywhere
    txn_currencies = {c for (c,) in (await db.execute(select(Transaction.currency_code).where(Transaction.tenant_id == t.id))).all()}
    assert txn_currencies == {"RWF"}


async def test_credit_sale_and_partial_payment_in_base_currency_behave_as_before(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=100000, customer=c, paid=0)
    assert order.outstanding_balance == 100000 and order.payment_status == "Unpaid"
    order = await pay(db, t, u, order.id, 40000)
    assert order.amount_paid == 40000 and order.outstanding_balance == 60000 and order.payment_status == "PartiallyPaid"
    with pytest.raises(ValidationError):
        await pay(db, t, u, order.id, 70000)               # more than is owed
    order = await pay(db, t, u, order.id, 60000)
    assert order.payment_status == "Paid"
    bal = await balances(db, t.id)
    assert net(bal, "1100") == 0 and "4900" not in bal
    await assert_ledger_balanced(db, t.id)


async def test_usd_tenant_with_a_usd_order(db):
    t, u = await make_tenant(db, "USD")
    p = await make_product(db, t)
    order = await place_order(db, t, u, p, unit_price=250)
    assert order.currency_code == "USD" and order.base_total == D("250.00")
    await assert_ledger_balanced(db, t.id)


# ── 2. foreign-currency invoice on an RWF tenant ──────────────────────────────

async def test_rwf_tenant_usd_invoice_keeps_the_original_amount_and_posts_base(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)

    assert order.currency_code == "USD" and order.total == 1000          # original USD amount survives
    assert order.exchange_rate == D(1450)
    assert order.base_total == D(1450000)                              # RWF equivalent, frozen
    assert order.outstanding_balance == 1000 and order.base_outstanding_balance == D(1450000)

    bal = await balances(db, t.id)
    assert net(bal, "1100") == D(1450000)                              # receivable carried in RWF at the invoice rate
    assert net(bal, "4000") + net(bal, "2100") == D(-1450000)          # revenue net of VAT + VAT = base total
    await assert_ledger_balanced(db, t.id)
    ledger_ccy = (await db.execute(select(Transaction.currency_code).where(Transaction.tenant_id == t.id))).scalars().all()
    assert set(ledger_ccy) == {"RWF"}


async def test_foreign_invoice_without_any_rate_is_refused_not_assumed_one(db):
    t, u = await make_tenant(db, "RWF")
    p = await make_product(db, t)
    with pytest.raises(MissingExchangeRateError):
        await place_order(db, t, u, p, currency="USD")
    assert (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == t.id))).scalar_one() == 0


async def test_rate_is_looked_up_from_the_tenants_own_rates_when_not_supplied(db):
    t, u = await make_tenant(db, "RWF")
    p = await make_product(db, t)
    await add_rate(db, t, "USD", "RWF", "1450", when=datetime.now(UTC) - timedelta(days=1))
    order = await place_order(db, t, u, p, unit_price=100, currency="USD")
    assert order.exchange_rate == D(1450) and order.base_total == D(145000)


async def test_inactive_or_unsupported_currency_is_rejected(db):
    t, u = await make_tenant(db, "RWF")
    p = await make_product(db, t)
    with pytest.raises(UnsupportedCurrencyError):                  # a symbol is never a currency
        await currency_service.require_active_currency(db, "$")
    with pytest.raises(UnsupportedCurrencyError):
        await place_order(db, t, u, p, currency="ZZZ", rate=D(1450))
    await db.execute(update(Currency).where(Currency.code == "EUR").values(is_active=False))
    with pytest.raises(CurrencyError, match="not currently enabled"):  # switched off by the platform
        await place_order(db, t, u, p, currency="EUR", rate=D(1600))


# ── 3. payments, partial payments and balances ────────────────────────────────

async def test_usd_partial_payments_keep_balances_in_usd_and_book_realised_fx(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)

    order = await pay(db, t, u, order.id, 400, rate=D(1470))            # USD 400 at a better rate
    assert order.amount_paid == 400 and order.outstanding_balance == 600   # still USD, never "USD − RWF"
    assert order.payment_status == "PartiallyPaid"
    first = order.payments[0]
    assert first.currency_code == "USD" and first.exchange_rate == D(1470)
    assert (first.base_amount, first.applied_amount, first.base_applied_amount) == (D(588000), D("400.00"), D(580000))
    bal = await balances(db, t.id)
    assert net(bal, "1000") == D(588000)                                 # cash at the payment-date rate
    assert net(bal, "4900") == D(-8000)                                  # realised FX gain (credit)
    assert net(bal, "1100") == D(1450000) - D(580000)                  # receivable cleared at the invoice rate

    order = await pay(db, t, u, order.id, 600, rate=D(1430))             # settle the rest at a worse rate
    assert order.payment_status == "Paid" and order.outstanding_balance == 0
    bal = await balances(db, t.id)
    assert net(bal, "1100") == 0                                           # receivable cleared exactly, no residue
    assert net(bal, "5950") == D(12000)                                  # realised FX loss (debit)
    assert net(bal, "1000") == D(588000) + D(858000)
    await assert_ledger_balanced(db, t.id)


async def test_usd_invoice_paid_in_base_currency(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)
    order = await pay(db, t, u, order.id, 725000, currency="RWF", rate=D(1450))
    pay_row = order.payments[0]
    assert pay_row.currency_code == "RWF" and pay_row.exchange_rate == D(1)
    assert pay_row.applied_amount == D("500.00") and order.outstanding_balance == 500
    await assert_ledger_balanced(db, t.id)


async def test_foreign_payment_without_rate_or_with_third_currency_is_refused(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)
    with pytest.raises(MissingExchangeRateError):
        await pay(db, t, u, order.id, 100)                                 # no rate anywhere
    await add_rate(db, t, "EUR", "RWF", "1600")
    with pytest.raises(ValidationError):
        await pay(db, t, u, order.id, 100, currency="EUR", rate=D(1600))  # a USD invoice paid in EUR


async def test_paying_a_base_invoice_in_foreign_cash(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000000, customer=c, paid=0)
    order = await pay(db, t, u, order.id, 500, currency="USD", rate=D(1450))
    assert order.amount_paid == 725000 and order.outstanding_balance == 275000
    await assert_ledger_balanced(db, t.id)


async def test_reversal_uses_the_stored_amounts_not_todays_rate(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)
    order = await pay(db, t, u, order.id, 400, rate=D(1470))
    await add_rate(db, t, "USD", "RWF", "1600")                            # the market moves afterwards

    order = await payment_service.reverse_payment(db, t.id, u.id, "Tester", order.payments[0].id, OrderPaymentReverse(reason="mistake"))
    assert order.amount_paid == 0 and order.outstanding_balance == 1000
    bal = await balances(db, t.id)
    assert net(bal, "1000") == 0                                           # cash unwound at 588,000, not 640,000
    assert net(bal, "4900") == 0                                           # the gain was unwound too
    assert net(bal, "1100") == D(1450000)                                # receivable restored in full
    await assert_ledger_balanced(db, t.id)


# ── 4. historical rates are preserved ─────────────────────────────────────────

async def test_changing_todays_rate_never_rewrites_posted_history(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    await add_rate(db, t, "USD", "RWF", "1450", when=datetime.now(UTC) - timedelta(days=2))
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", customer=c, paid=0)
    await add_rate(db, t, "USD", "RWF", "1470")                            # tomorrow's rate

    reread = await order_service.get_order(db, t.id, order.id)
    assert reread.exchange_rate == D(1450) and reread.base_total == D(1450000)
    row = (await db.execute(select(Order).where(Order.id == order.id))).scalar_one()
    assert row.exchange_rate == D(1450) and row.base_total == D("1450000.00")
    with pytest.raises(ValidationError):                                    # a completed order's currency/rate are frozen
        from app.modules.sales.schemas import OrderUpdate
        await order_service.update_order(db, t.id, order.id, OrderUpdate(exchange_rate=D(1470)))


async def test_return_reverses_at_the_original_invoice_rate(db):
    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    order = await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)
    await add_rate(db, t, "USD", "RWF", "1600")                            # the rate has moved since the sale
    item_id = (await order_service.get_order(db, t.id, order.id)).items[0].id
    ret = await return_service.create_return(db, t.id, u.id, ReturnCreate(
        order_id=order.id, status="Approved", return_date=datetime.now(UTC).date(),
        items=[ReturnItemCreate(order_item_id=item_id, product_id=p.id, product_name="Widget", quantity=1, refund_per_unit=200)],
    ))
    assert ret.currency_code == "USD" and ret.exchange_rate == D(1450)
    assert ret.base_refund_amount == D(290000)                           # 200 × 1450, not × 1600
    bal = await balances(db, t.id)
    net_revenue = D(order.base_total) - D(order.base_tax)
    assert net(bal, "4000") == -net_revenue + D(290000)                  # revenue reversed in RWF at 1450
    assert net(bal, "1100") == D(1450000) - D(290000)                  # receivable reduced by the same amount
    await assert_ledger_balanced(db, t.id)


# ── 5. receivables and reports never mix currencies ───────────────────────────

async def test_receivables_are_summed_in_base_currency_at_each_invoices_rate(db):
    from app.modules.sales.repository import OrderRepository

    t, u = await make_tenant(db, "RWF")
    p, c = await make_product(db, t), await make_customer(db, t)
    await place_order(db, t, u, p, unit_price=100000, customer=c, paid=0)                                  # RWF 100,000
    await place_order(db, t, u, p, unit_price=1000, currency="USD", rate=D(1450), customer=c, paid=0)    # USD 1,000
    summary = await OrderRepository(db).receivables_summary(t.id)
    assert summary["total_receivables"] == 1550000                          # not 101,000


# ── 6. base-currency guard, rates and tenant isolation ────────────────────────

async def test_base_currency_can_change_only_while_nothing_is_recorded(db):
    t, u = await make_tenant(db, "RWF")
    assert await currency_service.change_base_currency(db, t.id, "KES") == "KES"        # clean books: fine
    assert await currency_service.get_base_currency(db, t.id) == "KES"
    p = await make_product(db, t)
    await place_order(db, t, u, p, unit_price=1000)
    with pytest.raises(ValidationError, match="can't be changed"):
        await currency_service.change_base_currency(db, t.id, "USD")                    # money exists: refused
    assert await currency_service.get_base_currency(db, t.id) == "KES"                   # untouched


async def test_changing_base_currency_through_the_tenant_service_is_guarded_too(db):
    from app.modules.tenants.schemas import TenantUpdate
    from app.modules.tenants.service import tenant as tenant_service

    t, u = await make_tenant(db, "RWF")
    p = await make_product(db, t)
    await place_order(db, t, u, p, unit_price=1000)
    with pytest.raises(ValidationError):
        await tenant_service.update_tenant(db, t.id, TenantUpdate(currency="USD"))
    with pytest.raises(ValidationError):
        await tenant_service.update_tenant(db, t.id, TenantUpdate(currency="$"))


async def test_a_tenants_rates_are_invisible_to_other_tenants(db):
    a, _ = await make_tenant(db, "RWF")
    b, _ = await make_tenant(db, "RWF")
    await add_rate(db, a, "USD", "RWF", "1450")
    rate, scope = await currency_service.lookup_rate(db, a.id, "USD", "RWF")
    assert (rate, scope) == (D(1450), "tenant")
    with pytest.raises(MissingExchangeRateError):
        await currency_service.lookup_rate(db, b.id, "USD", "RWF")
    rows, total = await currency_service.list_rates(db, b.id)
    assert total == 0 and rows == []


async def test_tenant_rate_beats_platform_rate_and_platform_is_the_fallback(db):
    a, _ = await make_tenant(db, "RWF")
    b, _ = await make_tenant(db, "RWF")
    await add_rate(db, None, "USD", "RWF", "1440")                                      # platform-wide
    await add_rate(db, a, "USD", "RWF", "1450")                                         # A's own
    assert (await currency_service.lookup_rate(db, a.id, "USD", "RWF"))[1] == "tenant"
    assert await currency_service.lookup_rate(db, b.id, "USD", "RWF") == (D(1440), "platform")
    inv, scope = await currency_service.lookup_rate(db, b.id, "RWF", "USD")             # inverse pair derives from the same row
    assert scope == "platform" and inv == currency_service.invert_rate("1440")


# ── 7. expenses, purchases, supplier payments ─────────────────────────────────

async def test_foreign_currency_expense_keeps_original_and_posts_base_on_approval(db):
    t, u = await make_tenant(db, "RWF")
    exp = await expense_service.create_expense(
        db, t.id, u.id, ExpenseCreate(title="Intl hosting", amount=500, expense_date=datetime.now(UTC).date(), currency_code="USD", exchange_rate=D(1450)),
    )
    assert exp.currency_code == "USD" and exp.amount == 500 and exp.base_amount == D(725000)
    await expense_service.approve_expense(db, t.id, exp.id, u.id)
    bal = await balances(db, t.id)
    assert net(bal, "5900") == D(725000) and net(bal, "1000") == D(-725000)
    await assert_ledger_balanced(db, t.id)


async def test_base_currency_expense_is_unchanged(db):
    t, u = await make_tenant(db, "RWF")
    exp = await expense_service.create_expense(db, t.id, u.id, ExpenseCreate(title="Rent", amount=50000, expense_date=datetime.now(UTC).date()))
    assert exp.currency_code == "RWF" and exp.base_amount == D(50000)
    await expense_service.approve_expense(db, t.id, exp.id, u.id)
    assert net(await balances(db, t.id), "5900") == D(50000)


async def test_foreign_purchase_bill_and_supplier_payments(db):
    t, u = await make_tenant(db, "RWF")
    p = await make_product(db, t, stock=0)
    po = await purchase_service.create_purchase(db, t.id, u.id, PurchaseCreate(
        status="Received", currency_code="USD", exchange_rate=D(1450),
        items=[PurchaseItemCreate(product_id=p.id, product_name="Widget", unit_cost=1000, quantity=1)],
    ))
    assert po.currency_code == "USD" and po.total == 1000 and po.base_total == D(1450000)
    bal = await balances(db, t.id)
    assert net(bal, "1200") == D(1450000) and net(bal, "2000") == D(-1450000)        # Dr Inventory / Cr AP in RWF

    bill = (await bill_service.list_bills(db, t.id))[0]
    assert bill.currency_code == "USD" and bill.amount == 1000 and bill.base_amount == D(1450000)

    bill = await bill_service.record_payment(db, t.id, u.id, bill.id, SupplierPaymentCreate(amount=400, exchange_rate=D(1470)))
    assert bill.balance == 600 and bill.status == "PartiallyPaid"
    bal = await balances(db, t.id)
    assert net(bal, "5950") == D(8000)                                                 # paid 588,000 for a 580,000 liability → loss
    bill = await bill_service.record_payment(db, t.id, u.id, bill.id, SupplierPaymentCreate(amount=600, exchange_rate=D(1430)))
    assert bill.balance == 0 and bill.status == "Paid"
    bal = await balances(db, t.id)
    assert net(bal, "2000") == 0                                                         # payable cleared exactly
    assert net(bal, "4900") == D(-12000)                                               # 858,000 paid vs 870,000 carried → gain
    await assert_ledger_balanced(db, t.id)


# ── 8. platform (super admin) analytics across currencies ─────────────────────

@pytest.fixture
def analytics_env(db_conn, monkeypatch):
    """Point the analytics helpers (which open their own sessions) at the test transaction, and run
    their concurrent queries one at a time — one connection can't run two statements at once."""
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.admin import analytics

    monkeypatch.setattr(
        analytics, "AsyncSessionLocal",
        lambda: AsyncSession(bind=db_conn, expire_on_commit=False, join_transaction_mode="create_savepoint"),
    )

    async def sequential(*aws):
        return [await a for a in aws]

    monkeypatch.setattr(analytics.asyncio, "gather", sequential)
    invalidate_cache()
    yield analytics
    invalidate_cache()


async def test_platform_sales_convert_each_tenant_currency_and_never_sum_raw_amounts(db, analytics_env):
    country = f"Testland-{uuid.uuid4().hex[:6]}"
    rw, rw_u = await make_tenant(db, "RWF", country)
    us, us_u = await make_tenant(db, "USD", country)
    await place_order(db, rw, rw_u, await make_product(db, rw), unit_price=2000000)
    await place_order(db, us, us_u, await make_product(db, us), unit_price=1000)
    await add_rate(db, None, "USD", "RWF", "1450", when=datetime.now(UTC) - timedelta(days=3))
    await db.commit()

    flt = analytics_env.TenantFilter(country=country)
    today = analytics_env.resolve_period(None, None)
    summary = await analytics_env._sales_summary(today.start, today.end, flt)

    assert summary["reportingCurrency"] == "RWF"
    assert summary["total"] == 3450000.0                       # 2,000,000 + 1,000 × 1,450 — NOT 2,001,000
    assert not summary["partial"] and summary["missingRates"] == []
    by_cur = {b["currency"]: b for b in summary["breakdown"]}
    assert by_cur["RWF"]["originalAmount"] == 2000000.0
    assert by_cur["USD"]["originalAmount"] == 1000.0 and by_cur["USD"]["convertedAmount"] == 1450000.0


async def test_platform_sales_flag_a_currency_with_no_rate_instead_of_assuming_one(db, analytics_env):
    country = f"Testland-{uuid.uuid4().hex[:6]}"
    rw, rw_u = await make_tenant(db, "RWF", country)
    kes, kes_u = await make_tenant(db, "MZN", country)
    await place_order(db, rw, rw_u, await make_product(db, rw), unit_price=1000)
    await place_order(db, kes, kes_u, await make_product(db, kes), unit_price=21500)
    await db.commit()

    today = analytics_env.resolve_period(None, None)
    summary = await analytics_env._sales_summary(today.start, today.end, analytics_env.TenantFilter(country=country))
    assert summary["total"] == 1000.0                           # the MZN is not added as if it were RWF
    assert summary["partial"] and summary["missingRates"] == ["MZN"]
    mzn = next(b for b in summary["breakdown"] if b["currency"] == "MZN")
    assert mzn["originalAmount"] == 21500.0 and mzn["convertedAmount"] is None and mzn["missingRate"]


async def test_overview_metric_is_tenant_sales_in_the_reporting_currency(db, analytics_env):
    import json

    country = f"Testland-{uuid.uuid4().hex[:6]}"
    us, us_u = await make_tenant(db, "USD", country)
    await place_order(db, us, us_u, await make_product(db, us), unit_price=100)
    await add_rate(db, None, "USD", "RWF", "1450", when=datetime.now(UTC) - timedelta(days=1))
    await db.commit()
    resp = await analytics_env.analytics_overview(analytics_env.resolve_period(None, None), analytics_env.TenantFilter(country=country))
    data = json.loads(resp.body)["data"]
    keys = [m["key"] for m in data["metrics"]]
    assert "tenantSales" in keys and "platformRevenue" not in keys     # GMV is not labelled as PESAA revenue
    sales = next(m for m in data["metrics"] if m["key"] == "tenantSales")
    assert sales["currency"] == "RWF" and sales["value"] == 145000.0


async def test_reporting_currency_is_platform_wide_and_independent_of_tenants(db):
    assert await currency_service.get_reporting_currency(db) == "RWF"                    # seeded default
    await currency_service.set_reporting_currency(db, "USD", None)
    assert await currency_service.get_reporting_currency(db) == "USD"
    t, _ = await make_tenant(db, "KES")
    assert await currency_service.get_base_currency(db, t.id) == "KES"                  # tenant base untouched
    with pytest.raises(ValidationError):
        await currency_service.set_reporting_currency(db, "FRw", None)


# keep asyncio imported for pytest-asyncio's loop in this module
_ = asyncio
