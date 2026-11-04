"""Ledger foundation: posting dates, split-payment accounts, balanced journals, no silent posting skips."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.main import app
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.audit.models.audit import AuditLog
from tests.test_pos_checkout_access import _client, _till


async def _journals(db, tenant_id, order_id):
    txns = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant_id, Transaction.order_id == order_id))).scalars().all()
    rows = []
    for txn in txns:
        lines = (await db.execute(select(TransactionLine, Account).join(Account, Account.id == TransactionLine.account_id)
                                  .where(TransactionLine.transaction_id == txn.id))).all()
        rows.append((txn, [(a.code, line.type, float(line.amount)) for line, a in lines]))
    return rows


def _sale(product, **extra):
    return {"status": "Completed", "client_order_id": uuid.uuid4().hex,
            "items": [{"product_id": str(product.id), "product_name": "Thing", "unit_price": 1000, "quantity": 10}], **extra}


@pytest.mark.db
async def test_a_backdated_sale_posts_to_its_own_accounting_date(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    sold_at = datetime.now(UTC) - timedelta(days=9)
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json=_sale(
                product, payment_method="cash", amount_paid=10000, ordered_at=sold_at.isoformat()))
            assert made.status_code == 201, made.text
            order_id = uuid.UUID(made.json()["data"]["id"])
        journals = await _journals(db, tenant.id, order_id)
        assert journals, "the sale must be journaled"
        assert {txn.transaction_date for txn, _ in journals} == {sold_at.date()}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_split_payment_debits_each_method_account_and_every_journal_balances(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payments=[
                {"method": "cash", "amount": 4000}, {"method": "mobile", "amount": 3500, "reference": "MP-1"},
                {"method": "bank", "amount": 2500, "reference": "BK-1"}]))
            assert made.status_code == 201, made.text
            order_id = uuid.UUID(made.json()["data"]["id"])
        journals = await _journals(db, tenant.id, order_id)
        debits: dict[str, float] = {}
        for txn, lines in journals:
            assert round(sum(a for _, t, a in lines if t == "debit"), 2) == round(sum(a for _, t, a in lines if t == "credit"), 2), txn.reference
            assert txn.status == "Posted"
            for code, kind, amount in lines:
                if kind == "debit" and code in {"1000", "1010", "1020"}:
                    debits[code] = debits.get(code, 0) + amount
        assert debits == {"1000": 4000.0, "1020": 3500.0, "1010": 2500.0}
        credited = {}
        for _, lines in journals:
            for code, kind, amount in lines:
                if kind == "credit" and code in {"4000", "2100"}:
                    credited[code] = credited.get(code, 0) + amount
        assert round(sum(credited.values()), 2) == 10000.0  # revenue + VAT booked once, not once per payment
        # the money reaches the till and not receivables: net AR movement is nil
        ar = sum((a if t == "debit" else -a) for _, lines in journals for code, t, a in lines if code == "1100")
        assert round(ar, 2) == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_sale_is_refused_when_its_revenue_account_cannot_be_posted_to(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    revenue = (await db.execute(select(Account).where(Account.tenant_id == tenant.id, Account.code == "4000"))).scalar_one()
    revenue.is_active = False
    await db.flush()
    try:
        async with _client(owner, tenant, branch) as c:
            refused = await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))
        assert refused.status_code == 422, refused.text
        assert "4000" in refused.text or "account" in refused.text.lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_posting_a_sale_twice_returns_the_same_journal(db, monkeypatch):
    from app.modules.accounting.service.transaction import create_sale_transaction
    tenant, _branch, _product, _, owner = await _till(db, monkeypatch)
    from app.modules.sales.models.order import Order
    order = Order(tenant_id=tenant.id, order_number="DUP-1", total=1000, amount_paid=1000, status="Completed")
    db.add(order)
    await db.flush()
    order_id = order.id
    first = await create_sale_transaction(db, tenant.id, owner.id, order_id, 1000.0, "S-1", payment_method="cash", amount_paid=1000.0)
    second = await create_sale_transaction(db, tenant.id, owner.id, order_id, 1000.0, "S-1", payment_method="cash", amount_paid=1000.0)
    assert first == second
    count = len((await db.execute(select(Transaction).where(Transaction.tenant_id == tenant.id, Transaction.order_id == order_id, Transaction.type == "sale"))).scalars().all())
    assert count == 1


# ── corrections: write-offs, returns, stock adjustments, expense reversals ────

async def _net(db, tenant_id, *codes):
    from sqlalchemy import func
    rows = (await db.execute(select(Account.code, TransactionLine.type, func.sum(TransactionLine.amount))
        .join(TransactionLine, TransactionLine.account_id == Account.id).join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.tenant_id == tenant_id, Transaction.status == "Posted").group_by(Account.code, TransactionLine.type))).all()
    out = {code: 0.0 for code in codes}
    for code, kind, amount in rows:
        if code in out:
            out[code] += float(amount) if kind == "debit" else -float(amount)
    return out


@pytest.mark.db
async def test_writing_off_a_customer_debt_posts_bad_debt_and_clears_receivable_partly_then_fully(db, monkeypatch):
    from app.core.exceptions import ValidationError
    from app.modules.accounting.service import debt_actions
    from app.modules.sales.models.customer import Customer
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    buyer = Customer(tenant_id=tenant.id, name="Slow Payer")
    db.add(buyer)
    await db.flush()
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json=_sale(
                product, customer_id=str(buyer.id), due_date="2099-01-01", payment_method="cash", amount_paid=0))
            assert made.status_code == 201, made.text
            order_id = uuid.UUID(made.json()["data"]["id"])
        assert (await _net(db, tenant.id, "1100"))["1100"] == 10000.0
        with pytest.raises(ValidationError):
            await debt_actions.write_off(db, owner, "receivable", order_id, branch.id, "too much", amount=20000)
        await debt_actions.write_off(db, owner, "receivable", order_id, branch.id, "customer disappeared", amount=4000)
        after_part = await _net(db, tenant.id, "1100", "5600")
        assert after_part == {"1100": 6000.0, "5600": 4000.0}
        await debt_actions.write_off(db, owner, "receivable", order_id, branch.id, "rest of it")
        assert await _net(db, tenant.id, "1100", "5600") == {"1100": 0.0, "5600": 10000.0}
        with pytest.raises(ValidationError):
            await debt_actions.write_off(db, owner, "receivable", order_id, branch.id, "again")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_return_reverses_revenue_vat_and_cost_and_puts_stock_back(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))
            assert made.status_code == 201, made.text
            sale = made.json()["data"]
            before = await _net(db, tenant.id, "4000", "2100", "1200", "5000")
            line = sale["items"][0]
            returned = await c.post("/api/v1/tenants/sales/returns", json={
                "order_id": sale["id"], "status": "Approved", "return_date": datetime.now(UTC).date().isoformat(), "reason": "wrong size",
                "items": [{"order_item_id": line["id"], "product_id": line["product_id"], "product_name": "Thing",
                           "quantity": 2, "refund_per_unit": 1000, "line_refund": 2000}]})
            assert returned.status_code == 201, returned.text
        after = await _net(db, tenant.id, "4000", "2100", "1200", "5000")
        delta = {k: round(after[k] - before[k], 2) for k in after}
        assert delta["2100"] + delta["4000"] == 2000.0  # revenue + VAT reversed together (debits)
        assert delta["2100"] == round(2000 * 1525.42 / 10000, 2)
        assert delta["1200"] == 1000.0 and delta["5000"] == -1000.0  # 2 units x cost 500 back into inventory, out of COGS
        await db.refresh(product)
        assert float(product.stock) == 42
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_manual_stock_changes_move_the_ledger_with_the_quantity(db, monkeypatch):
    from app.modules.inventory.schemas.product import RestockRequest
    from app.modules.inventory.service.product import restock_product
    tenant, _branch, product, _, owner = await _till(db, monkeypatch)
    await restock_product(db, tenant.id, product.id, RestockRequest(qty=44, mode="adjust", reason="damaged"), owner)  # 50 -> 44, cost 500
    assert await _net(db, tenant.id, "1200", "5800") == {"1200": -3000.0, "5800": 3000.0}
    await restock_product(db, tenant.id, product.id, RestockRequest(qty=4, mode="restock", reason="found"), owner)  # +4
    assert await _net(db, tenant.id, "1200", "5800") == {"1200": -1000.0, "5800": 1000.0}


@pytest.mark.db
async def test_an_approved_expense_is_reversed_by_a_new_journal_with_a_reason(db, monkeypatch):

    from app.core.exceptions import ValidationError
    from app.modules.accounting.schemas import ExpenseCreate
    from app.modules.accounting.service import expense as expenses
    tenant, _branch, _product, _, owner = await _till(db, monkeypatch)
    created = await expenses.create_expense(db, tenant.id, owner.id, ExpenseCreate(
        title="Generator fuel", amount=5000, expense_date=datetime.now(UTC).date(), category="Utilities", payment_method="Cash"), owner.full_name)
    await expenses.approve_expense(db, tenant.id, created.id, owner.id, owner.full_name)
    assert (await _net(db, tenant.id, "5200"))["5200"] == 5000.0
    with pytest.raises(ValidationError):
        await expenses.reverse_expense(db, tenant.id, created.id, owner.id, " ", owner.full_name)
    done = await expenses.reverse_expense(db, tenant.id, created.id, owner.id, "paid twice", owner.full_name)
    assert done.status == "Reversed" and done.reversal_reason == "paid twice"
    assert await _net(db, tenant.id, "5200", "1000") == {"5200": 0.0, "1000": 0.0}
    originals = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant.id, Transaction.type == "expense"))).scalars().all()
    assert len(originals) == 1 and originals[0].status == "Posted"  # the original journal is untouched
    with pytest.raises(ValidationError):
        await expenses.reverse_expense(db, tenant.id, created.id, owner.id, "again", owner.full_name)


@pytest.mark.db
async def test_an_expense_without_a_mappable_account_cannot_be_approved_into_other_expense(db, monkeypatch):
    from app.core.exceptions import ValidationError
    from app.modules.accounting.schemas import ExpenseCreate
    from app.modules.accounting.service import expense as expenses
    tenant, _branch, _product, _, owner = await _till(db, monkeypatch)
    created = await expenses.create_expense(db, tenant.id, owner.id, ExpenseCreate(
        title="Mystery", amount=900, expense_date=datetime.now(UTC).date(), category="Misc", payment_method="Cash"), owner.full_name)
    with pytest.raises(ValidationError, match="expense account"):
        await expenses.approve_expense(db, tenant.id, created.id, owner.id, owner.full_name)
    assert (await _net(db, tenant.id, "5900"))["5900"] == 0.0


@pytest.mark.db
async def test_income_statement_separates_service_revenue_and_other_expenses_and_still_adds_up(db, monkeypatch):
    from app.modules.accounting.service.statements import income_statement
    from app.modules.accounting.service.transaction import post_journal
    tenant, _branch, _product, _, owner = await _till(db, monkeypatch)
    await post_journal(db, tenant.id, owner.id, type="manual", description="mix", lines=[
        ("1000", "Cash", "debit", 1500, "c"), ("4000", "Sales Revenue", "credit", 1000, "g"), ("4100", "Service Revenue", "credit", 500, "s")])
    await post_journal(db, tenant.id, owner.id, type="manual", description="costs", lines=[
        ("5200", "Utilities", "debit", 200, "u"), ("5950", "FX Loss", "debit", 50, "f"), ("5900", "Other Expense", "debit", 30, "o"), ("1000", "Cash", "credit", 280, "c")])
    report = await income_statement(db, tenant.id, None, None)
    assert (report.total_revenue, report.total_sales_revenue, report.total_service_revenue) == (1500, 1000, 500)
    assert (report.total_operating_expenses, report.total_other_expenses) == (200, 80)
    assert report.net_income == 1500 - 200 - 80


@pytest.mark.db
async def test_a_closed_period_refuses_postings_dated_inside_it_and_reopening_needs_a_reason(db, monkeypatch):
    from datetime import timedelta

    from app.core.exceptions import ValidationError
    from app.modules.accounting.service.catalog import set_period_lock
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    today = datetime.now(UTC).date()
    await set_period_lock(db, owner, today - timedelta(days=5), None)
    try:
        async with _client(owner, tenant, branch) as c:
            old = await c.post("/api/v1/tenants/sales/orders", json=_sale(
                product, payment_method="cash", amount_paid=10000, ordered_at=(datetime.now(UTC) - timedelta(days=9)).isoformat()))
            assert old.status_code == 422 and "closed" in old.text.lower(), old.text
            current = await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))
            assert current.status_code == 201, current.text
    finally:
        app.dependency_overrides.clear()
    with pytest.raises(ValidationError, match="reason"):
        await set_period_lock(db, owner, today - timedelta(days=30), "")
    await set_period_lock(db, owner, today - timedelta(days=30), "auditor asked for a correction")
    audit = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "accounting.period_lock"))).scalars().all()
    assert len(audit) == 2  # the close and the reopen; the refused reopen wrote nothing


@pytest.mark.db
async def test_audit_rows_cannot_be_edited(db, monkeypatch):
    from sqlalchemy.exc import DBAPIError
    tenant, _branch, _product, _, owner = await _till(db, monkeypatch)
    row = AuditLog(tenant_id=tenant.id, actor_user_id=owner.id, action="x.y", entity_type="x", summary="original")
    db.add(row)
    await db.flush()
    row.summary = "rewritten"
    with pytest.raises(DBAPIError, match="append-only"):
        await db.flush()


@pytest.mark.db
async def test_reconciliation_reports_gaps_without_changing_anything(db, monkeypatch):
    from decimal import Decimal

    from app.modules.accounting.models.debt import DebtAdjustment
    from app.modules.accounting.service.integrity import reconcile
    from app.modules.sales.models.order import Order
    tenant, _branch, _product, _, owner = await _till(db, monkeypatch)
    db.add(Order(tenant_id=tenant.id, order_number="LEGACY-1", total=500, amount_paid=0, status="Completed"))
    await db.flush()
    db.add(DebtAdjustment(tenant_id=tenant.id, kind="receivable", document_id=uuid.uuid4(), action="write_off", amount=Decimal(75), reason="legacy", created_by=owner.id))
    await db.flush()
    before = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant.id))).scalars().all()
    report = await reconcile(db, owner)
    kinds = {f["type"] for f in report["findings"]}
    assert {"sale_without_journal", "write_off_without_journal"} <= kinds
    assert report["summary"]["high_risk"] >= 2
    after = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant.id))).scalars().all()
    assert len(before) == len(after)
