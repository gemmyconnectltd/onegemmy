"""Regression cases from the Depot Technologies accounting QA report."""
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError as SchemaError
from sqlalchemy import func, select

from app.core.exceptions import ConflictError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.repository.account import AccountRepository
from app.modules.accounting.schemas.workspace import (
    AssetRequest,
    IncomeReceipt,
    ReconciliationRequest,
    ReportRequest,
)
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.accounting.service.dashboard import domain, income, overview
from app.modules.accounting.service.operations import (
    income_receipt,
    journal,
    reconcile,
    register_asset,
)
from app.modules.accounting.service.workspace import generate
from app.modules.tenants.models import Branch, Tenant, User


@pytest.fixture
async def qa_finance(db):
    tenant = Tenant(name="QA isolated business", slug=uuid.uuid4().hex, currency="USD", vat_enabled=True)
    db.add(tenant)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="QA", role="owner", is_superuser=True, hashed_password="x")
    branch = Branch(tenant_id=tenant.id, name="QA branch")
    db.add_all([owner, branch])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    accounts = {a.code: a.id for a in (await db.execute(select(Account).where(Account.tenant_id == tenant.id))).scalars()}
    return tenant, owner, branch, accounts


@pytest.mark.db
async def test_income_full_period_totals_are_net_revenue_and_paginated(db, qa_finance):
    tenant, owner, branch, a = qa_finance
    today = datetime.now(UTC).date()
    for index in range(60):
        txn = Transaction(tenant_id=tenant.id, reference=f"QA-{index}", type="sale", status="Posted", transaction_date=today, branch_id=branch.id, currency_code="USD")
        db.add(txn)
        await db.flush()
        db.add_all([TransactionLine(transaction_id=txn.id, account_id=a["1000"], type="debit", amount=118), TransactionLine(transaction_id=txn.id, account_id=a["4000"], type="credit", amount=100), TransactionLine(transaction_id=txn.id, account_id=a["2100"], type="credit", amount=18)])
    await journal(db, owner, "QA-REFUND", today, "Refund", [(a["4000"], "debit", Decimal(5)), (a["1000"], "credit", Decimal(5))], branch.id, "return")
    await db.flush()
    first = await income(db, owner, active_branch=branch.id)
    last = await income(db, owner, page=3, active_branch=branch.id)
    assert first["total"] == 61 and len(first["items"]) == 25 and len(last["items"]) == 11
    assert first["totals"]["posted"] == last["totals"]["posted"] == "5995.00"
    assert Decimal((await overview(db, owner, branch.id))["revenue"]) == Decimal(5995)
    assert {Decimal(row["amount"]) for row in first["items"]}.issubset({Decimal(100), Decimal(-5)})
    other = Branch(tenant_id=tenant.id, name="Other")
    db.add(other)
    await db.flush()
    assert (await income(db, owner, active_branch=other.id))["total"] == 0


@pytest.mark.db
async def test_income_receipt_accounts_vat_numbering_and_retry(db, qa_finance):
    _tenant, owner, branch, a = qa_finance
    today = datetime.now(UTC).date()
    await journal(db, owner, "TXN-0355", today, "Prior numbered entry", [(a["1000"], "debit", Decimal(1)), (a["3000"], "credit", Decimal(1))])
    await db.flush()
    data = IncomeReceipt(client_reference="QA-income-key", transaction_date=today, description="Mobile receipt", amount=Decimal(118), cash_account_id=a["1020"], revenue_account_id=a["4000"], apply_vat=True, vat_account_id=a["2100"], branch_id=branch.id)
    first = await income_receipt(db, owner, data)
    second = await income_receipt(db, owner, data)
    assert first.id == second.id and first.reference == "TXN-0356"
    by_account = {line.account_id: Decimal(str(line.amount)) for line in first.lines}
    assert by_account == {a["1020"]: Decimal(118), a["4000"]: Decimal(100), a["2100"]: Decimal(18)}
    assert first.branch_id == branch.id and first.status == "Draft"
    with pytest.raises(ConflictError):
        await income_receipt(db, owner, data.model_copy(update={"amount": Decimal(236)}))
    for value in [0, -1]:
        with pytest.raises(SchemaError):
            IncomeReceipt(**{**data.model_dump(), "amount": value})
    with pytest.raises(ValidationError):
        await income_receipt(db, owner, data.model_copy(update={"cash_account_id": a["1100"]}))


@pytest.mark.db
async def test_cash_picker_count_reconciliation_account_and_filtered_ledger(db, qa_finance):
    tenant, owner, _branch, a = qa_finance
    rows, count = await AccountRepository(db).filtered(tenant.id, active=True, cash_only=True)
    assert count == len(rows) == 3
    assert all(row.code.startswith("10") and row.type == "Assets" for row in rows)
    await journal(db, owner, "CASH", datetime.now(UTC).date(), "Funding", [(a["1010"], "debit", Decimal(100)), (a["3000"], "credit", Decimal(100))])
    await db.flush()
    await reconcile(db, owner, ReconciliationRequest(reference="QA-recon", account_id=a["1010"], as_of=datetime.now(UTC).date(), statement_balance=Decimal(90)))
    records = await domain(db, owner, "reconciliations")
    assert records["items"][0]["account"] == "1010 · Bank"
    report = await generate(db, owner, ReportRequest(kind="general-ledger", account_id=a["1010"]))
    assert report["reconciliation"]["applicable"] is False
    assert Decimal(report["reconciliation"]["difference"]) == 100
    cash = await generate(db, owner, ReportRequest(kind="general-ledger", cash_only=True))
    assert all(row["account"].startswith("1010") for row in cash["rows"])


@pytest.mark.db
async def test_new_asset_purchase_posts_once_and_defaults_are_additive(db, qa_finance):
    tenant, owner, branch, a = qa_finance
    for code in ["1150", "1500", "1590", "2160", "2170", "3100", "5300", "5500"]:
        assert code in a
    request = AssetRequest(reference="QA-new-asset", name="Equipment", acquisition_date=datetime.now(UTC).date(), cost=Decimal(120), life_months=12,
        asset_account_id=a["1500"], depreciation_account_id=a["1590"], expense_account_id=a["5500"], paid_from_account_id=a["1010"], branch_id=branch.id)
    first = await register_asset(db, owner, request)
    second = await register_asset(db, owner, request)
    assert first["id"] == second["id"]
    count = (await db.execute(select(func.count()).select_from(Transaction).where(Transaction.tenant_id == tenant.id, Transaction.type == "asset_acquisition"))).scalar_one()
    assert count == 1
    from app.modules.accounting.service.dashboard import cash_position
    position = await cash_position(db, owner, a["1010"], branch.id)
    assert Decimal(position["balance"]) == Decimal(-120)
    assert (await domain(db, owner, "cash", active_branch=branch.id))["negative_count"] == 1
    with pytest.raises(ConflictError):
        await register_asset(db, owner, request.model_copy(update={"paid_from_account_id": a["1000"]}))
    await seed_default_accounts(db, tenant.id)
    assert (await AccountRepository(db).get_by_code(tenant.id, "1500")).id == a["1500"]


@pytest.mark.db
async def test_due_dates_validate_issue_date_and_missing_legacy_terms_are_visible(db, qa_finance):
    from app.modules.accounting.repository.subledgers import SubledgerRepository
    from app.modules.procurement.models.purchase_order import PurchaseOrder
    from app.modules.procurement.service.supplier_bill import create_bill_for_purchase
    from app.modules.sales.models.order import Order
    from app.modules.sales.schemas.order import OrderCreate, OrderUpdate
    from app.modules.sales.service.order import create_order, update_order
    tenant, owner, _branch, _a = qa_finance
    now = datetime.now(UTC)
    with pytest.raises(ValidationError, match="issue date"):
        await create_order(db, tenant.id, owner.id, OrderCreate(due_date=now.date()-timedelta(days=1)))
    order = Order(tenant_id=tenant.id, order_number="QA-LEGACY", ordered_at=now, due_date=now.date()-timedelta(days=1), total=10, amount_paid=0, status="Completed")
    db.add(order)
    await db.flush()
    aging = [row async for row in SubledgerRepository(db).aging(tenant.id, now.date(), False)]
    assert "precedes issue date" in aging[0]["due_note"]
    with pytest.raises(ValidationError, match="issue date"):
        await update_order(db, tenant.id, order.id, OrderUpdate(due_date=now.date()-timedelta(days=2)))
    po = PurchaseOrder(tenant_id=tenant.id, reference="QA-PO", status="Received", total=10, currency_code="USD")
    db.add(po)
    await db.flush()
    bill = await create_bill_for_purchase(db, tenant.id, owner.id, po, now.date()+timedelta(days=30))
    assert bill.due_date == now.date()+timedelta(days=30)
