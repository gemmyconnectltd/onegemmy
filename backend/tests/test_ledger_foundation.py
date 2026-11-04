"""Ledger foundation: posting dates, split-payment accounts, balanced journals, no silent posting skips."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import get_db
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


@pytest.mark.db
async def test_sales_returns_can_be_filtered_by_date_period(db, monkeypatch):
    from datetime import timedelta
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            line = sale["items"][0]
            made = await c.post("/api/v1/tenants/sales/returns", json={
                "order_id": sale["id"], "status": "Approved", "return_date": datetime.now(UTC).date().isoformat(),
                "items": [{"order_item_id": line["id"], "product_id": line["product_id"], "product_name": "Thing", "quantity": 1, "refund_per_unit": 1000, "line_refund": 1000}]})
            assert made.status_code == 201, made.text
            today = datetime.now(UTC).date()
            inside = await c.get(f"/api/v1/tenants/sales/returns?from_date={today}&to_date={today}")
            outside = await c.get(f"/api/v1/tenants/sales/returns?to_date={today - timedelta(days=3)}")
            assert inside.json()["data"]["total"] == 1 and outside.json()["data"]["total"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_late_evening_sale_posts_on_the_businesss_own_day(db, monkeypatch):
    from datetime import timedelta
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    tenant.timezone = "Africa/Kigali"  # UTC+2
    await db.flush()
    sold_at = (datetime.now(UTC) - timedelta(days=2)).replace(hour=23, minute=30, second=0, microsecond=0)  # 01:30 the next day in Kigali
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000, ordered_at=sold_at.isoformat()))
            assert made.status_code == 201, made.text
            order_id = uuid.UUID(made.json()["data"]["id"])
        journals = await _journals(db, tenant.id, order_id)
        assert {txn.transaction_date for txn, _ in journals} == {(sold_at + timedelta(hours=2)).date()}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_checkout_refuses_more_than_the_stock_and_leaves_no_trace(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            body = _sale(product, payment_method="cash", amount_paid=60000)
            body["items"][0]["quantity"] = 60  # only 50 on the shelf
            refused = await c.post("/api/v1/tenants/sales/orders", json=body)
        assert refused.status_code in (409, 422), refused.text
        journals = (await db.execute(select(Transaction).where(Transaction.tenant_id == tenant.id, Transaction.type == "sale"))).scalars().all()
        assert journals == []
        await db.refresh(product)
        assert float(product.stock) == 50
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_partial_payment_books_the_cash_received_and_the_rest_as_receivable_once(db, monkeypatch):
    from app.modules.sales.models.customer import Customer
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    buyer = Customer(tenant_id=tenant.id, name="Part Payer")
    db.add(buyer)
    await db.flush()
    body = _sale(product, customer_id=str(buyer.id), due_date="2099-01-01", payment_method="mobile", amount_paid=4000, payment_reference="MP-77")
    try:
        async with _client(owner, tenant, branch) as c:
            first = await c.post("/api/v1/tenants/sales/orders", json=body)
            retry = await c.post("/api/v1/tenants/sales/orders", json=body)  # a double-tapped Charge
        assert first.status_code == 201, first.text
        assert retry.status_code == 201 and retry.json()["data"]["id"] == first.json()["data"]["id"]
        assert first.json()["data"]["outstanding_balance"] == 6000
        order_id = uuid.UUID(first.json()["data"]["id"])
        journals = await _journals(db, tenant.id, order_id)
        assert len([j for j in journals if j[0].type == "sale"]) == 1
        debits = {code: amount for _, lines in journals for code, kind, amount in lines if kind == "debit" and code in {"1020", "1100"}}
        assert debits == {"1020": 4000.0, "1100": 6000.0}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_normal_user_cannot_delete_even_with_a_delete_grant(db, monkeypatch):
    from app.modules.tenants.models import Permission, Role
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    role = await db.get(Role, cashier.role_id)
    grants = (await db.execute(select(Permission).where(Permission.resource.in_(["items", "orders"]), Permission.action == "delete"))).scalars().all()
    if grants:
        role.permissions = list(grants)
        await db.flush()
    try:
        async with _client(cashier, tenant, branch) as c:
            refused = await c.delete(f"/api/v1/tenants/inventory/products/{product.id}")
            assert refused.status_code == 403 and "owners and administrators" in refused.text, refused.text
        async with _client(owner, tenant, branch) as c:
            allowed = await c.delete(f"/api/v1/tenants/inventory/products/{product.id}")
            assert allowed.status_code in (200, 204), allowed.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_every_delete_endpoint_refuses_a_normal_user_who_holds_every_grant(db):
    import re

    from app.core.security import create_access_token
    from app.modules.tenants.models import Permission, Role, Tenant, User
    n = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Del {n}", slug=f"del-{n}", is_active=True, subscription_status="active")
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="Everything", description="every grant")
    role.permissions = list((await db.execute(select(Permission))).scalars().all())
    db.add(role)
    await db.flush()
    user = User(email=f"del{n}@x.test", hashed_password="x", full_name="Normal", role="member", tenant_id=tenant.id, role_id=role.id, is_active=True, is_superuser=False)
    db.add(user)
    await db.flush()
    token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})

    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    skip = re.compile(r"^/api/v1/(auth/|global/|public/|billing/|admin/|support/|activity|health)")
    leaks = []
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"}) as c:
            for path, item in app.openapi()["paths"].items():
                if "delete" not in item or skip.match(path) or path.startswith("/api/v1/ai/conversations/"):  # a person clearing their own chat
                    continue
                url = re.sub(r"\{[^}]+\}", lambda _m: str(uuid.uuid4()), path)
                async with db.begin_nested():
                    res = await c.request("DELETE", url, json={})
                if res.status_code != 403:
                    leaks.append(f"{path} → {res.status_code}")
    finally:
        app.dependency_overrides.clear()
    assert not leaks, f"Delete endpoints a normal user can reach: {leaks}"


@pytest.mark.db
async def test_an_invoice_is_shared_as_an_emailed_pdf_with_no_public_link(db, monkeypatch):

    from app.modules.sales.service import invoice_share
    sent = []

    async def fake_send(to, subject, body, *args, attachments=None, **kwargs):
        sent.append((to, subject, attachments))
        return "<id@test>"

    monkeypatch.setattr(invoice_share, "send_email_message", fake_send)
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            assert (await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/invoice/share")).status_code in (404, 405)  # no public links exist
            no_email = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/invoice/email", json={})
            assert no_email.status_code == 422  # a walk-in has no email on file
            emailed = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/invoice/email", json={"to": "buyer@example.com", "message": "Thanks!"})
            assert emailed.status_code == 200, emailed.text
            receipt = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/invoice/email", json={"kind": "receipt", "to": "buyer@example.com"})
            assert receipt.status_code == 200 and sent[-1][1].startswith("Receipt ")
        assert sent[0][0] == "buyer@example.com" and sent[0][2][0][1] == "application/pdf" and sent[0][2][0][2].startswith(b"%PDF")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_an_owner_can_archive_and_restore_a_sale_and_nothing_is_deleted(db, monkeypatch):
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            before = await _net(db, tenant.id, "4000", "1000")
            assert (await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/archive", json={"reason": ""})).status_code == 422  # a reason is needed
            done = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/archive", json={"reason": "duplicate test entry"})
            assert done.status_code == 200 and done.json()["data"]["archived_at"]
            assert (await c.get("/api/v1/tenants/sales/orders")).json()["data"]["total"] == 0
            archived = await c.get("/api/v1/tenants/sales/orders?archived=true")
            assert archived.json()["data"]["total"] == 1
            assert await _net(db, tenant.id, "4000", "1000") == before  # the books are untouched
            assert (await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/restore")).status_code == 200
            assert (await c.get("/api/v1/tenants/sales/orders")).json()["data"]["total"] == 1
        async with _client(cashier, tenant, branch) as c:
            refused = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/archive", json={"reason": "no"})
            assert refused.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_only_an_owner_can_change_a_sales_date_and_its_journal_moves_with_it(db, monkeypatch):
    from datetime import timedelta

    from app.modules.accounting.service.catalog import set_period_lock
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    new_at = datetime.now(UTC) - timedelta(days=6)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            order_id = uuid.UUID(sale["id"])
        async with _client(cashier, tenant, branch) as c:
            assert (await c.patch(f"/api/v1/tenants/sales/orders/{sale['id']}", json={"ordered_at": new_at.isoformat()})).status_code == 403
        async with _client(owner, tenant, branch) as c:
            future = (datetime.now(UTC) + timedelta(days=3)).isoformat()
            assert (await c.patch(f"/api/v1/tenants/sales/orders/{sale['id']}", json={"ordered_at": future})).status_code == 422
            moved = await c.patch(f"/api/v1/tenants/sales/orders/{sale['id']}", json={"ordered_at": new_at.isoformat()})
            assert moved.status_code == 200, moved.text
        assert {txn.transaction_date for txn, _ in await _journals(db, tenant.id, order_id)} == {new_at.date()}
        await set_period_lock(db, owner, datetime.now(UTC).date() - timedelta(days=2), None)
        async with _client(owner, tenant, branch) as c:
            locked = await c.patch(f"/api/v1/tenants/sales/orders/{sale['id']}", json={"ordered_at": (datetime.now(UTC) - timedelta(days=1)).isoformat()})
            assert locked.status_code == 422 and "closed" in locked.text.lower()  # the sale now sits in a closed period
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_new_customer_needs_a_tin_whether_individual_or_business(db, monkeypatch):
    tenant, branch, _product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            for kind in ("individual", "business"):
                missing = await c.post("/api/v1/tenants/sales/customers", json={"name": f"No TIN {kind}", "customer_type": kind})
                assert missing.status_code == 422 and "tin" in missing.text.lower()
                blank = await c.post("/api/v1/tenants/sales/customers", json={"name": f"Blank {kind}", "customer_type": kind, "tin": "  "})
                assert blank.status_code == 422
            ok = await c.post("/api/v1/tenants/sales/customers", json={"name": "Has TIN", "customer_type": "individual", "tin": "100200300"})
            assert ok.status_code == 201 and ok.json()["data"]["tin"] == "100200300"
            at_the_till = await c.post("/api/v1/tenants/sales/customers", json={"name": "Walk-up buyer", "customer_type": "individual", "source": "pos"})
            assert at_the_till.status_code == 201 and at_the_till.json()["data"]["tin"] is None  # the till is never held up by a missing TIN
            cleared = await c.patch(f"/api/v1/tenants/sales/customers/{ok.json()['data']['id']}", json={"tin": ""})
            assert cleared.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_an_owner_corrects_a_completed_sale_by_reversal_and_repost(db, monkeypatch):
    from app.modules.accounting.models.account import Account  # noqa: F401
    from app.modules.sales.models.customer import Customer
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    buyer = Customer(tenant_id=tenant.id, name="Corrected Buyer", tin="123456")
    db.add(buyer)
    await db.flush()
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json=_sale(product, customer_id=str(buyer.id), due_date="2099-01-01", payment_method="cash", amount_paid=0))
            assert made.status_code == 201, made.text
            sale = made.json()["data"]  # 10 x 1,000 on credit; stock 50 -> 40
            order_id = uuid.UUID(sale["id"])
            line = {"product_id": str(product.id), "product_name": "Thing", "unit_price": 1000, "quantity": 8}
            correction = {"items": [line], "discount": 0, "reason": "customer took 8, not 10"}
            async with _client(cashier, tenant, branch) as other:
                assert (await other.post(f"/api/v1/tenants/sales/orders/{sale['id']}/correct", json=correction)).status_code == 403
            assert (await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/correct", json={**correction, "reason": ""})).status_code == 422
            fixed = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/correct", json=correction)
            assert fixed.status_code == 200, fixed.text
            body = fixed.json()["data"]
            assert body["total"] == 8000 and body["outstanding_balance"] == 8000 and len(body["items"]) == 1
        await db.refresh(product)
        assert float(product.stock) == 42  # two units went back on the shelf
        journals = await _journals(db, tenant.id, order_id)
        assert len(journals) == 3  # the original, its reversal, and the corrected sale: nothing edited or deleted
        assert (await _net(db, tenant.id, "1100"))["1100"] == 8000.0  # receivables carry only the corrected amount
        for _txn, lines in journals:
            assert round(sum(a for _, k, a in lines if k == "debit"), 2) == round(sum(a for _, k, a in lines if k == "credit"), 2)
        # a correction that would drop the total below what is already paid is refused
        async with _client(owner, tenant, branch) as c:
            paid = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            low = await c.post(f"/api/v1/tenants/sales/orders/{paid['id']}/correct", json={"items": [{**line, "quantity": 5}], "reason": "wrong quantity"})
            assert low.status_code == 422 and "already paid" in low.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_approving_a_return_with_no_items_and_no_refund_does_not_fail(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            made = await c.post("/api/v1/tenants/sales/returns", json={"order_id": sale["id"], "status": "Pending", "return_date": datetime.now(UTC).date().isoformat(), "items": []})
            assert made.status_code == 201, made.text
            approved = await c.patch(f"/api/v1/tenants/sales/returns/{made.json()['data']['id']}", json={"status": "Approved"})
            assert approved.status_code == 200, approved.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_an_owner_voids_a_paid_sale_and_everything_nets_to_zero(db, monkeypatch):
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            order_id = uuid.UUID(sale["id"])
            async with _client(cashier, tenant, branch) as other:
                assert (await other.post(f"/api/v1/tenants/sales/orders/{sale['id']}/void", json={"reason": "wrong sale"})).status_code == 403
            assert (await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/void", json={"reason": ""})).status_code == 422
            done = await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/void", json={"reason": "entered twice by mistake"})
            assert done.status_code == 200, done.text
            assert done.json()["data"]["status"] == "Cancelled"
            assert (await c.post(f"/api/v1/tenants/sales/orders/{sale['id']}/void", json={"reason": "again"})).status_code == 422
        await db.refresh(product)
        assert float(product.stock) == 50  # the 10 units are back
        net = await _net(db, tenant.id, "1000", "1100", "4000", "2100", "5000", "1200")
        assert all(abs(v) < 0.005 for v in net.values()), net  # cash, receivables, revenue, VAT, cost and inventory all net to zero
        journals = await _journals(db, tenant.id, order_id)
        assert len(journals) == 2 and {t.type for t, _ in journals} == {"sale", "reversal"}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_cashier_asks_for_a_void_and_an_approver_decides(db, monkeypatch):
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
        async with _client(cashier, tenant, branch) as other:
            asked = await other.post(f"/api/v1/tenants/sales/orders/{sale['id']}/void-request", json={"reason": "customer cancelled at the till"})
            assert asked.status_code == 201, asked.text
            request_id = asked.json()["data"]["id"]
            assert (await other.post(f"/api/v1/tenants/sales/orders/{sale['id']}/void-request", json={"reason": "customer cancelled again"})).status_code == 409
        async with _client(owner, tenant, branch) as c:
            decided = await c.post(f"/api/v1/tenants/approvals/{request_id}/approve", json={})
            assert decided.status_code == 200, decided.text
            assert (await c.get(f"/api/v1/tenants/sales/orders/{sale['id']}")).json()["data"]["status"] == "Cancelled"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_return_cannot_take_back_more_than_was_sold(db, monkeypatch):
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            sale = (await c.post("/api/v1/tenants/sales/orders", json=_sale(product, payment_method="cash", amount_paid=10000))).json()["data"]
            line = sale["items"][0]

            def body(quantity):
                return {"order_id": sale["id"], "status": "Pending", "return_date": datetime.now(UTC).date().isoformat(),
                        "items": [{"order_item_id": line["id"], "product_id": line["product_id"], "product_name": "Thing", "quantity": quantity, "refund_per_unit": 1000}]}
            assert (await c.post("/api/v1/tenants/sales/returns", json=body(6))).status_code == 201
            over = await c.post("/api/v1/tenants/sales/returns", json=body(6))  # 6 + 6 > 10 sold
            assert over.status_code == 422 and "still be returned" in over.text
            assert (await c.post("/api/v1/tenants/sales/returns", json=body(4))).status_code == 201
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_cash_and_bank_accounts_can_be_opened_and_transfers_need_a_reason_and_are_listed(db, monkeypatch):
    tenant, branch, _product, _, owner = await _till(db, monkeypatch)
    try:
        async with _client(owner, tenant, branch) as c:
            opened = [await c.post("/api/v1/tenants/accounting/workspace/cash-accounts", json={"name": name, "kind": kind}) for name, kind in
                      [("Front till", "cash"), ("Equity Bank", "bank"), ("MTN MoMo", "mobile")]]
            assert [r.status_code for r in opened] == [201, 201, 201], [r.text for r in opened]
            codes = {r.json()["data"]["name"]: r.json()["data"]["code"] for r in opened}
            assert codes["Front till"] == "1001" and codes["Equity Bank"] == "1011" and codes["MTN MoMo"] == "1021"  # 1000/1010/1020 already exist
            assert (await c.post("/api/v1/tenants/accounting/workspace/cash-accounts", json={"name": "equity bank", "kind": "bank"})).status_code == 409
            ids = {r.json()["data"]["name"]: r.json()["data"]["id"] for r in opened}
            body = {"reference": "TRF-0001", "from_account_id": ids["Front till"], "to_account_id": ids["Equity Bank"], "amount": 500, "transaction_date": datetime.now(UTC).date().isoformat()}
            assert (await c.post("/api/v1/tenants/accounting/workspace/transfers", json=body)).status_code == 422  # no reason given
            made = await c.post("/api/v1/tenants/accounting/workspace/transfers", json={**body, "description": "Banked the day's takings"})
            assert made.status_code == 201, made.text
            listed = await c.get("/api/v1/tenants/accounting/workspace/records/transfers")
            assert listed.status_code == 200, listed.text
            row = listed.json()["data"]["items"][0]
            assert (row["from"], row["to"], float(row["amount"]), row["reason"], row["by"]) == ("Front till", "Equity Bank", 500.0, "Banked the day's takings", owner.full_name)
            balances = (await c.get("/api/v1/tenants/accounting/workspace/records/cash")).json()["data"]
            assert {"Cash", "Bank", "Mobile money", "Total"} <= set(balances["totals"])
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_twelve_product_sale_can_have_two_products_returned_for_a_cash_refund_or_a_credit_note(db, monkeypatch):
    from app.modules.inventory.models.product import Product
    tenant, branch, _product, _, owner = await _till(db, monkeypatch)
    products = [Product(tenant_id=tenant.id, name=f"Item {n}", price=1000 + n, cost=500, stock=20) for n in range(12)]
    db.add_all(products)
    await db.flush()
    total = sum(1000 + n for n in range(12))
    try:
        async with _client(owner, tenant, branch) as c:
            made = await c.post("/api/v1/tenants/sales/orders", json={"status": "Completed", "client_order_id": uuid.uuid4().hex, "payment_method": "cash", "amount_paid": total,
                "items": [{"product_id": str(p.id), "product_name": p.name, "unit_price": float(p.price), "quantity": 1} for p in products]})
            assert made.status_code == 201, made.text
            sale = made.json()["data"]
            assert len(sale["items"]) == 12 and sale["total"] == total
            cash_before = (await _net(db, tenant.id, "1000"))["1000"]
            two = sale["items"][:2]
            refund = sum(i["unit_price"] for i in two)
            lines = [{"order_item_id": i["id"], "product_id": i["product_id"], "product_name": i["product_name"], "quantity": 1, "refund_per_unit": i["unit_price"]} for i in two]
            cash = await c.post("/api/v1/tenants/sales/returns", json={"order_id": sale["id"], "status": "Approved", "refund_method": "cash",
                                                                         "return_date": datetime.now(UTC).date().isoformat(), "items": lines})
            assert cash.status_code == 201, cash.text
            assert cash.json()["data"]["refund_method"] == "cash"
            assert (await _net(db, tenant.id, "1000"))["1000"] == cash_before - refund  # the cash left the till
            # the other ten stay sold: those two lines are used up, the rest can still come back later
            again = await c.post("/api/v1/tenants/sales/returns", json={"order_id": sale["id"], "status": "Pending", "return_date": datetime.now(UTC).date().isoformat(), "items": lines})
            assert again.status_code == 422
            credit = await c.post("/api/v1/tenants/sales/returns", json={"order_id": sale["id"], "status": "Approved", "refund_method": "credit_note",
                "return_date": datetime.now(UTC).date().isoformat(), "items": [{**{k: sale["items"][2][k2] for k, k2 in [("order_item_id", "id"), ("product_id", "product_id"), ("product_name", "product_name")]}, "quantity": 1, "refund_per_unit": sale["items"][2]["unit_price"]}]})
            assert credit.status_code == 201, credit.text
            assert (await _net(db, tenant.id, "1000"))["1000"] == cash_before - refund  # a credit note pays nothing out; the value stays as credit on the account
            assert (await _net(db, tenant.id, "1100"))["1100"] == -sale["items"][2]["unit_price"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_expense_cases_reclassify_pay_later_refund_duplicates_limit_and_recurring(db, monkeypatch):
    from datetime import timedelta
    tenant, branch, _product, cashier, owner = await _till(db, monkeypatch)
    base = "/api/v1/tenants/expense-management"
    today = datetime.now(UTC).date()
    try:
        async with _client(owner, tenant, branch) as c:
            accounts = {a.code: str(a.id) for a in (await db.execute(select(Account).where(Account.tenant_id == tenant.id))).scalars().all()}

            def body(**extra):
                return {"title": "Office rent", "amount": 5000, "expense_date": today.isoformat(), "category": "Rent", "payment_method": "Cash", **extra}
            first = await c.post(base, json=body())
            assert first.status_code == 201, first.text
            # a possible duplicate is flagged, and can be confirmed
            dup = await c.post(base, json=body())
            assert dup.status_code == 409 and "Possible duplicate" in dup.text
            assert (await c.post(base, json=body(allow_duplicate=True, client_reference="second-one"))).status_code == 201
            expense_id = first.json()["data"]["id"]
            assert (await c.post(f"{base}/{expense_id}/approve")).status_code == 200
            assert (await _net(db, tenant.id, "5100"))["5100"] == 5000.0
            # wrong category: moved by an adjusting entry; the original posting stays
            moved = await c.post(f"{base}/{expense_id}/reclassify", json={"account_id": accounts["5200"], "reason": "this was the electricity bill"})
            assert moved.status_code == 200, moved.text
            assert await _net(db, tenant.id, "5100", "5200") == {"5100": 0.0, "5200": 5000.0}
            # the supplier gives part of it back
            back = await c.post(f"{base}/{expense_id}/refund", json={"amount": 1200, "method": "Cash", "reason": "billing error credited"})
            assert back.status_code == 200 and float(back.json()["data"]["refunded_amount"]) == 1200
            assert (await _net(db, tenant.id, "5200"))["5200"] == 3800.0
            assert (await c.post(f"{base}/{expense_id}/refund", json={"amount": 9999, "method": "Cash", "reason": "too much"})).status_code == 422
            # booked now, paid later: Accounts Payable until it is paid
            later = await c.post(base, json=body(title="Generator repair", amount=800, category="Supplies", on_credit=True))
            later_id = later.json()["data"]["id"]
            assert (await c.post(f"{base}/{later_id}/approve")).status_code == 200
            assert (await _net(db, tenant.id, "2000"))["2000"] == -800.0
            assert (await c.post(f"{base}/{later_id}/pay", json={"payment_method": "Bank Transfer"})).status_code == 200
            assert await _net(db, tenant.id, "2000", "1010") == {"2000": 0.0, "1010": -800.0}
            assert (await c.post(f"{base}/{later_id}/pay", json={"payment_method": "Cash"})).status_code == 409
            # small expenses are approved on the spot once the owner sets a limit
            assert (await c.patch(f"{base}/settings", json={"auto_approve_below": 1000})).status_code == 200
            small = await c.post(base, json=body(title="Tea and sugar", amount=300, category="Supplies"))
            assert small.status_code == 201 and small.json()["data"]["status"] == "Approved"
            big = await c.post(base, json=body(title="New shelves", amount=4000, category="Supplies"))
            assert big.json()["data"]["status"] == "Pending"
            # recurring: due ones are created once, and running again adds nothing
            template = await c.post(f"{base}/recurring", json={"title": "Shop rent", "amount": 700, "category": "Rent", "frequency": "monthly", "next_date": (today - timedelta(days=40)).isoformat()})
            assert template.status_code == 201, template.text
            ran = await c.post(f"{base}/recurring/run")
            assert ran.status_code == 200 and ran.json()["data"]["created"] >= 1
            assert (await c.post(f"{base}/recurring/run")).json()["data"]["created"] == 0
        async with _client(cashier, tenant, branch) as other:
            assert (await other.patch(f"{base}/settings", json={"auto_approve_below": 99999})).status_code in (403, 422)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_platform_admin_sets_a_default_password_and_the_user_must_change_it(db, monkeypatch):
    from app.core.security import hash_password
    from app.modules.tenants.models import User
    tenant, branch, _product, cashier, _owner = await _till(db, monkeypatch)
    platform = User(email=f"platform{uuid.uuid4().hex[:6]}@example.test", hashed_password=hash_password("Whatever1"), full_name="Platform", role="superadmin", is_active=True, is_superuser=True)
    cashier.email = f"cashier{uuid.uuid4().hex[:6]}@example.com"
    db.add(platform)
    await db.flush()
    try:
        from app.core.security import create_access_token
        platform_token = create_access_token(str(platform.id), {})
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {platform_token}"}) as admin:
            weak = await admin.post(f"/api/v1/admin/tenants/{tenant.id}/users/{cashier.id}/set-password", json={"password": "weak"})
            assert weak.status_code == 422
            done = await admin.post(f"/api/v1/admin/tenants/{tenant.id}/users/{cashier.id}/set-password", json={"password": "Welcome2026"})
            assert done.status_code == 200, done.text
            assert "Welcome2026" not in done.text  # never echoed back
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t") as anonymous:
            login = await anonymous.post("/api/v1/auth/login", json={"email": cashier.email, "password": "Welcome2026", "tenant_slug": tenant.slug})
            assert login.status_code == 200, login.text
            assert login.json()["data"]["user"]["must_change_password"] is True
            token = login.json()["data"]["access_token"]
            changed = await anonymous.post("/api/v1/tenants/users/change-password", json={"current_password": "Welcome2026", "new_password": "BrandNew2026"}, headers={"Authorization": f"Bearer {token}"})
            assert changed.status_code == 200, changed.text
            again = await anonymous.post("/api/v1/auth/login", json={"email": cashier.email, "password": "BrandNew2026", "tenant_slug": tenant.slug})
            assert again.json()["data"]["user"]["must_change_password"] is False
        async with _client(cashier, tenant, branch) as ordinary:
            assert (await ordinary.post(f"/api/v1/admin/tenants/{tenant.id}/users/{cashier.id}/set-password", json={"password": "Welcome2026"})).status_code == 403
    finally:
        app.dependency_overrides.clear()
