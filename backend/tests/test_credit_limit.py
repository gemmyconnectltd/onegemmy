"""Per-customer daily credit limit and the approval of credit sales held over it, on a real database.

Every test runs inside a rolled-back transaction (see conftest.py), so nothing persists."""
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal as D

import pytest
from sqlalchemy import func, select

from app.core.exceptions import ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.inventory.models.product import Product
from app.modules.sales.models.customer import Customer
from app.modules.sales.schemas import OrderCreate, OrderItemCreate, OrderPaymentCreate, OrderUpdate
from app.modules.sales.service import order as order_service
from app.modules.sales.service import order_payment as payment_service
from app.modules.tenants.models import Tenant, User

pytestmark = pytest.mark.db

LIMIT = D(500000)


async def make_tenant(db, limit=LIMIT):
    t = Tenant(name=f"T-{uuid.uuid4().hex[:6]}", slug=f"t-{uuid.uuid4().hex[:10]}", currency="RWF", credit_daily_limit=limit)
    db.add(t)
    await db.flush()
    u = User(email=f"{uuid.uuid4().hex[:8]}@test.local", hashed_password="x", full_name="Cashier", tenant_id=t.id, role="member")
    db.add(u)
    await db.flush()
    await seed_default_accounts(db, t.id)
    p = Product(tenant_id=t.id, name="Widget", sku=f"W-{uuid.uuid4().hex[:6]}", price=1000, cost=400, stock=1000)
    db.add(p)
    await db.flush()
    return t, u, p


async def customer(db, t, name="Buyer"):
    c = Customer(tenant_id=t.id, name=name)
    db.add(c)
    await db.flush()
    return c


async def sell(db, t, u, p, c, amount, *, paid=0, approver=False, status="Completed"):
    # VAT is on by default and prices are VAT-inclusive, so unit_price == the total the customer owes.
    data = OrderCreate(
        status=status, customer_id=c.id, amount_paid=paid, due_date=datetime.now(UTC).date() + timedelta(days=30), payment_method="cash",
        items=[OrderItemCreate(product_id=p.id, product_name=p.name, unit_price=amount, quantity=1)],
    )
    return await order_service.create_order(db, t.id, u.id, data, can_approve_credit=approver)


async def stock(db, p):
    await db.refresh(p)
    return p.stock


async def ledger_entries(db, t):
    return (await db.execute(select(func.count()).select_from(Transaction).where(Transaction.tenant_id == t.id))).scalar_one()


async def receivable(db, t):
    rows = (await db.execute(
        select(TransactionLine.type, func.sum(TransactionLine.amount))
        .join(Account, Account.id == TransactionLine.account_id).join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.tenant_id == t.id, Account.code == "1100").group_by(TransactionLine.type)
    )).all()
    d = {typ: D(v) for typ, v in rows}
    return d.get("debit", D(0)) - d.get("credit", D(0))


async def test_no_limit_means_credit_sales_complete_as_before(db):
    t, u, p = await make_tenant(db, limit=None)
    c = await customer(db, t)
    o = await sell(db, t, u, p, c, 900000)
    assert o.status == "Completed" and o.outstanding_balance == 900000


async def test_credit_within_the_daily_limit_completes_and_is_recorded(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    o = await sell(db, t, u, p, c, 300000)
    assert o.status == "Completed" and o.credit_base == D(300000)
    assert await stock(db, p) == 999


async def test_credit_over_the_limit_is_held_with_nothing_posted(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    await sell(db, t, u, p, c, 300000)
    before_stock, before_ledger = await stock(db, p), await ledger_entries(db, t)
    held = await sell(db, t, u, p, c, 300000, paid=50000)              # 300k + 250k credit = 550k > 500k
    assert held.status == "Awaiting Approval"
    assert held.requested_paid == D(50000) and held.amount_paid == 0 and held.credit_base is None
    assert await stock(db, p) == before_stock                           # no stock out
    assert await ledger_entries(db, t) == before_ledger                 # no ledger entry
    assert not held.payments


async def test_the_limit_is_per_customer(db):
    t, u, p = await make_tenant(db)
    a, b = await customer(db, t, "A"), await customer(db, t, "B")
    await sell(db, t, u, p, a, 400000)
    assert (await sell(db, t, u, p, b, 400000)).status == "Completed"


async def test_only_credit_counts_not_cash_and_payments_do_not_free_room(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    cash = await sell(db, t, u, p, c, 900000, paid=900000)              # fully paid: no credit at all
    assert cash.status == "Completed" and cash.credit_base is None
    first = await sell(db, t, u, p, c, 400000)                          # 400k credit
    await payment_service.record_payment(db, t.id, u.id, "Cashier", first.id, OrderPaymentCreate(amount=400000, payment_method="cash"))
    again = await sell(db, t, u, p, c, 200000)                          # 400k granted earlier + 200k > 500k
    assert again.status == "Awaiting Approval"


async def test_an_approver_can_grant_credit_over_the_limit_directly(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    await sell(db, t, u, p, c, 400000)
    o = await sell(db, t, u, p, c, 400000, approver=True)
    assert o.status == "Completed" and o.credit_base == D(400000)


async def test_approving_posts_the_sale_exactly_once(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    await sell(db, t, u, p, c, 400000)
    held = await sell(db, t, u, p, c, 300000, paid=50000)
    assert held.status == "Awaiting Approval"
    boss = User(email=f"{uuid.uuid4().hex[:8]}@test.local", hashed_password="x", full_name="CEO", tenant_id=t.id, role="owner")
    db.add(boss)
    await db.flush()

    done = await order_service.approve_order(db, t.id, held.id, boss.id, "CEO", note="Known good client")
    assert done.status == "Completed" and done.approved_by == boss.id and done.approval_note == "Known good client"
    assert done.amount_paid == 50000 and done.outstanding_balance == 250000 and done.credit_base == D(250000)
    assert await stock(db, p) == 998                                    # both sales took stock
    assert await receivable(db, t) == D(400000 + 250000)               # AR = 400k + (300k - 50k)
    with pytest.raises(ValidationError):                                 # a decision is final
        await order_service.approve_order(db, t.id, held.id, boss.id, "CEO")


async def test_rejecting_leaves_no_trace_in_stock_or_ledger(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    await sell(db, t, u, p, c, 400000)
    held = await sell(db, t, u, p, c, 300000)
    stock_before, ledger_before = await stock(db, p), await ledger_entries(db, t)
    out = await order_service.reject_order(db, t.id, held.id, u.id, "CEO", note="Over exposure")
    assert out.status == "Rejected" and out.approval_note == "Over exposure"
    assert await stock(db, p) == stock_before and await ledger_entries(db, t) == ledger_before
    with pytest.raises(ValidationError):
        await order_service.reject_order(db, t.id, held.id, u.id, "CEO")


async def test_a_held_order_cannot_be_pushed_through_by_editing_its_status(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    await sell(db, t, u, p, c, 400000)
    held = await sell(db, t, u, p, c, 300000)
    with pytest.raises(ValidationError):
        await order_service.update_order(db, t.id, held.id, OrderUpdate(status="Completed"))
    with pytest.raises(ValidationError):
        await order_service.update_order(db, t.id, held.id, OrderUpdate(status="Awaiting Approval"))
