# ruff: noqa: ASYNC230
# Export inspection uses small local fixture files, outside request handlers.
import csv
import os
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from openpyxl import load_workbook
from sqlalchemy import func, select

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.schemas import AccountUpdate, TransactionCreate
from app.modules.accounting.schemas.workspace import (
    AssetAction,
    AssetRequest,
    ReportRequest,
    TransferRequest,
)
from app.modules.accounting.service import statements
from app.modules.accounting.service.account import seed_default_accounts, update_account
from app.modules.accounting.service.cashflow import allocate_cash
from app.modules.accounting.service.operations import (
    asset_action,
    journal,
    register_asset,
    transfer,
)
from app.modules.accounting.service.transaction import create_transaction
from app.modules.accounting.service.workspace import generate, read_snapshot
from app.modules.accounting.service.workspace_export import export_snapshot
from app.modules.tenants.models import Branch, Tenant, User


def test_compound_cash_is_allocated_once_and_rounded_exactly():
    items = allocate_cash(Decimal("100.00"), [("sale", Decimal(-118)), ("expense", Decimal(18))])
    assert items == [("sale", Decimal("100.00"))]
    parts = allocate_cash(Decimal("0.01"), [("a", Decimal(-1)), ("b", Decimal(-1)), ("c", Decimal(-1))])
    assert sum(p for _, p in parts) == Decimal("0.01")
    assert allocate_cash(Decimal(0), [("a", Decimal(-100))]) == []


@pytest.fixture
async def finance(db):
    tenant = Tenant(name="Report Test Business", slug=f"finance-{uuid.uuid4().hex}", currency="USD")
    db.add(tenant)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.com", full_name="Owner", role="owner", is_superuser=True, hashed_password="x", is_active=True)
    branch = Branch(tenant_id=tenant.id, name="Branch One")
    db.add_all([owner, branch])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    accounts = {a.code: a.id for a in (await db.execute(select(Account).where(Account.tenant_id == tenant.id))).scalars()}
    return tenant, owner, branch, accounts


@pytest.mark.db
async def test_statements_cash_transfer_contra_assets_and_saved_exports(db, finance):
    tenant, owner, branch, a = finance
    day = date(2026, 1, 1)
    await journal(db, owner, "OPEN", day, "Opening equity", [(a["1000"], "debit", Decimal(1000)), (a["3000"], "credit", Decimal(1000))], branch.id)
    await journal(db, owner, "COMPOUND", day, "Compound cash receipt", [(a["1000"], "debit", Decimal(118)), (a["4000"], "credit", Decimal(100)), (a["2100"], "credit", Decimal(18))], branch.id)
    await journal(db, owner, "TRANSFER", day, "Cash to bank", [(a["1000"], "credit", Decimal(200)), (a["1010"], "debit", Decimal(200))], branch.id)
    await journal(db, owner, "ASSET", day, "Equipment", [(a["1500"], "debit", Decimal(120)), (a["1000"], "credit", Decimal(120))], branch.id)
    await journal(db, owner, "DEPR", day, "Depreciation", [(a["5500"], "debit", Decimal(10)), (a["1590"], "credit", Decimal(10))], branch.id)
    await db.flush()
    flow = await statements.cash_flow(db, tenant.id, day, day, branch.id)
    assert flow.net_cash_change == Decimal(998)
    assert flow.ending_cash == Decimal(998)
    assert flow.operating.total == Decimal(118) and flow.investing.total == Decimal(-120)
    assert flow.financing.total == Decimal(1000)
    sheet = await statements.balance_sheet(db, tenant.id, day, branch.id)
    assert sheet.in_balance and sheet.total_assets == Decimal(1108)
    income = await statements.income_statement(db, tenant.id, day, day, branch.id)
    assert income.net_income == Decimal(90)
    report = await generate(db, owner, ReportRequest(kind="balance-sheet", as_of=day, branch_id=branch.id))
    assert report["reconciliation"]["balanced"]
    # Later source mutations do not alter an existing preview or its exports.
    await journal(db, owner, "LATER", day, "Later receipt", [(a["1000"], "debit", Decimal(500)), (a["4000"], "credit", Decimal(500))], branch.id)
    await db.flush()
    saved = await read_snapshot(db, owner, uuid.UUID(report["id"]))
    assert saved["totals"] == report["totals"]
    for fmt in ["csv", "xlsx", "pdf"]:
        path, _filename, _media = await export_snapshot(db, owner, uuid.UUID(report["id"]), fmt)
        try:
            assert os.path.getsize(path) > 100
            if fmt == "csv":
                with open(path, encoding="utf-8-sig") as file:
                    rows = list(csv.reader(file))
                assert ["Assets", report["totals"]["Assets"]] in rows
            elif fmt == "xlsx":
                workbook = load_workbook(path, read_only=True)
                assert ("Assets", report["totals"]["Assets"], None, None)[:2] in [tuple(row[:2]) for row in workbook.active.values]
                workbook.close()
            else:
                with open(path, "rb") as file:
                    assert file.read(4) == b"%PDF"
        finally:
            os.unlink(path)


@pytest.mark.db
async def test_all_eight_reports_and_scope_isolation(db, finance):
    tenant, owner, branch, a = finance
    await journal(db, owner, "ONE", date(2026, 1, 1), "Opening", [(a["1000"], "debit", Decimal(100)), (a["3000"], "credit", Decimal(100))], branch.id)
    await db.flush()
    today = datetime.now(UTC).date()
    for kind in ["income-statement", "balance-sheet", "cash-flow", "equity", "trial-balance", "receivables-aging", "payables-aging", "inventory"]:
        report = await generate(db, owner, ReportRequest(kind=kind, from_date=date(2026, 1, 1), as_of=today, to_date=today))
        assert report["id"] and report["columns"] and report["currency"] == "USD"
    scoped = await generate(db, owner, ReportRequest(kind="trial-balance", branch_id=branch.id, as_of=today))
    stranger_tenant = Tenant(name="Other", slug=uuid.uuid4().hex)
    db.add(stranger_tenant)
    await db.flush()
    stranger = User(tenant_id=stranger_tenant.id, email=f"{uuid.uuid4().hex}@example.com", full_name="Other owner", role="owner", is_superuser=True, hashed_password="x")
    db.add(stranger)
    await db.flush()
    from app.core.exceptions import NotFoundError
    with pytest.raises(NotFoundError):
        await read_snapshot(db, stranger, uuid.UUID(scoped["id"]))
    employee = User(tenant_id=tenant.id, branch_id=branch.id, email=f"{uuid.uuid4().hex}@example.com", full_name="Branch owner", role="owner", is_superuser=True, hashed_password="x")
    db.add(employee)
    await db.flush()
    global_report = await generate(db, owner, ReportRequest(kind="trial-balance", as_of=today))
    with pytest.raises(ForbiddenError):
        await read_snapshot(db, employee, uuid.UUID(global_report["id"]))
    with pytest.raises(ValidationError):
        await generate(db, employee, ReportRequest(kind="inventory", as_of=today))


@pytest.mark.db
async def test_account_ownership_and_posted_account_protection(db, finance):
    tenant, owner, _branch, a = finance
    other = Tenant(name="Other", slug=uuid.uuid4().hex)
    db.add(other)
    await db.flush()
    wrong = Account(tenant_id=other.id, code="1000", name="Other cash", type="Assets", normal_balance="debit")
    db.add(wrong)
    await db.flush()
    with pytest.raises(ValidationError):
        await create_transaction(db, tenant.id, owner.id, TransactionCreate(type="manual", transaction_date="2026-01-01", lines=[{"account_id": a["1000"], "type": "debit", "amount": 100}, {"account_id": wrong.id, "type": "credit", "amount": 100}]))
    await journal(db, owner, "USED", date(2026, 1, 1), "Used account", [(a["1000"], "debit", Decimal(100)), (a["3000"], "credit", Decimal(100))])
    await db.flush()
    with pytest.raises(ValidationError):
        await update_account(db, tenant.id, a["1000"], AccountUpdate(is_active=False), owner)


@pytest.mark.db
async def test_asset_depreciation_disposal_and_transfer_retry(db, finance):
    tenant, owner, _branch, a = finance
    txn = await journal(db, owner, "ACQ", date(2026, 1, 1), "Acquire equipment", [(a["1500"], "debit", Decimal(120)), (a["1000"], "credit", Decimal(120))])
    await db.flush()
    asset = await register_asset(db, owner, AssetRequest(reference="ASSET1", name="Equipment", acquisition_date=date(2026, 1, 1), cost=Decimal(120), life_months=12,
                          asset_account_id=a["1500"], depreciation_account_id=a["1590"], expense_account_id=a["5500"], acquisition_transaction_id=txn.id))
    result = await asset_action(db, owner, uuid.UUID(asset["id"]), AssetAction(action="depreciate", as_of=date(2026, 1, 31)))
    assert Decimal(result["accumulated"]) == Decimal(10)
    await asset_action(db, owner, uuid.UUID(asset["id"]), AssetAction(action="depreciate", as_of=date(2026, 1, 31)))
    dep_count = (await db.execute(select(func.count()).select_from(Transaction).where(Transaction.tenant_id == tenant.id, Transaction.type == "depreciation"))).scalar_one()
    assert dep_count == 1
    await asset_action(db, owner, uuid.UUID(asset["id"]), AssetAction(action="dispose", as_of=date(2026, 2, 15), proceeds=Decimal(100), cash_account_id=a["1000"], gain_loss_account_id=a["5960"]))
    sheet = await statements.balance_sheet(db, tenant.id, date(2026, 2, 15))
    assert sheet.in_balance
    data = TransferRequest(reference="RETRY1", from_account_id=a["1000"], to_account_id=a["1010"], amount=Decimal(5), transaction_date=date(2026, 2, 15))
    assert await transfer(db, owner, data) == await transfer(db, owner, data)


@pytest.mark.db
async def test_historical_aging_payment_dates_reversal_and_legacy_gap(db, finance):
    from app.modules.accounting.repository.subledgers import SubledgerRepository
    from app.modules.sales.models.order import Order
    from app.modules.sales.models.order_payment import OrderPayment
    tenant, _owner, branch, _a = finance
    order = Order(tenant_id=tenant.id, order_number="AGING", status="Completed", ordered_at=datetime(2026, 1, 1, tzinfo=UTC), total=Decimal(100), amount_paid=Decimal(25), due_date=date(2026, 1, 15), currency_code="EUR", exchange_rate=Decimal(2), branch_id=branch.id)
    db.add(order)
    await db.flush()
    db.add_all([OrderPayment(tenant_id=tenant.id, order_id=order.id, reference="P1", amount=25, applied_amount=25, paid_at=datetime(2026, 2, 1, tzinfo=UTC), status="Completed"), OrderPayment(tenant_id=tenant.id, order_id=order.id, reference="P2", amount=10, applied_amount=10, paid_at=datetime(2026, 1, 20, tzinfo=UTC), status="Reversed", reversed_at=datetime(2026, 2, 10, tzinfo=UTC))])
    await db.flush()
    repo = SubledgerRepository(db)
    january = [r async for r in repo.aging(tenant.id, date(2026, 1, 31), False, branch.id)]
    assert january[0]["amount"] == "180.00" and january[0]["bucket"] == "days_1_30"
    february = [r async for r in repo.aging(tenant.id, date(2026, 2, 28), False, branch.id)]
    assert february[0]["amount"] == "150.00" and february[0]["bucket"] == "days_31_60"
    before = [r async for r in repo.aging(tenant.id, date(2026, 1, 16), False)]
    assert before[0]["amount"] == "200.00"
    order.amount_paid = Decimal(30)
    await db.flush()
    with pytest.raises(ValidationError, match="Historical payment detail"):
        [r async for r in repo.aging(tenant.id, date(2026, 2, 28), False)]
    current = [r async for r in repo.aging(tenant.id, datetime.now(UTC).date(), False)]
    assert current[0]["amount"] == "140.00"


@pytest.mark.db
async def test_domain_queries_payroll_posting_and_used_account_name_edit(db, finance):
    from app.modules.accounting.service.dashboard import domain, overview
    from app.modules.accounting.service.operations import post_payroll
    from app.modules.hr.models.employee import Employee
    from app.modules.hr.models.payroll import PayrollEntry
    tenant, owner, branch, a = finance
    today = datetime.now(UTC).date()
    await journal(db, owner, "FUND", today, "Capital", [(a["1000"], "debit", Decimal(500)), (a["3000"], "credit", Decimal(500))])
    await db.flush()
    changed = await update_account(db, tenant.id, a["1000"], AccountUpdate(name="Till", group_name=None, parent_id=None, is_active=True), owner)
    assert changed.name == "Till"
    employee = Employee(tenant_id=tenant.id, employee_code="FIN", first_name="Finance", last_name="Test")
    db.add(employee)
    await db.flush()
    payroll = PayrollEntry(tenant_id=tenant.id, employee_id=employee.id, period=today.strftime("%Y-%m"), base_salary=100, bonus=10, deductions=20, net_pay=90, status="Paid", paid_at=datetime.now(UTC))
    db.add(payroll)
    await db.flush()
    for view in ["cash", "assets", "reconciliations", "payroll", "tax", "tax-payments", "pending"]:
        assert "items" in await domain(db, owner, view)
    await post_payroll(db, owner, payroll.id, a["1000"])
    await post_payroll(db, owner, payroll.id, a["1000"])
    assert (await domain(db, owner, "payroll"))["items"][0]["posting_status"] == "Posted"
    result = await overview(db, owner)
    assert Decimal(result["expenses"]) == 110 and Decimal(result["cash_balance"]) == 410
    with pytest.raises(ValidationError, match="business-wide"):
        await domain(db, owner, "payroll", active_branch=branch.id)


@pytest.mark.db
async def test_payable_payment_retry_and_complete_paginated_export(db, finance):
    from app.modules.accounting.service.workspace import source_document
    from app.modules.procurement.models.purchase_order import PurchaseOrder
    from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment
    from app.modules.procurement.schemas.supplier_bill import SupplierPaymentCreate
    from app.modules.procurement.service.supplier_bill import record_payment
    tenant, owner, branch, a = finance
    po = PurchaseOrder(tenant_id=tenant.id, reference="PO-FIN", status="Received", branch_id=branch.id, total=Decimal(100))
    db.add(po)
    await db.flush()
    bill = SupplierBill(tenant_id=tenant.id, reference="BILL-FIN", purchase_order_id=po.id, bill_date=date(2026, 1, 1), due_date=date(2026, 1, 15), amount=100, amount_paid=0, status="Unpaid")
    db.add(bill)
    await db.flush()
    payment = SupplierPaymentCreate(client_reference="PAY-FIN", amount=Decimal(25), payment_method="cash")
    await record_payment(db, tenant.id, owner.id, bill.id, payment)
    await record_payment(db, tenant.id, owner.id, bill.id, payment)
    assert (await db.execute(select(func.count()).select_from(SupplierPayment).where(SupplierPayment.tenant_id == tenant.id))).scalar_one() == 1
    assert (await source_document(db, owner, bill.id, True))["balance"] == 75
    aging = await generate(db, owner, ReportRequest(kind="payables-aging", as_of=datetime.now(UTC).date()))
    assert aging["rows"][0]["amount"] == "75.00" and aging["rows"][0]["bucket"] == "over_90"
    for index in range(27):
        await journal(db, owner, f"PAGE-{index}", date(2026, 1, 1), "Pagination", [(a["1000"], "debit", Decimal(1)), (a["4000"], "credit", Decimal(1))])
    await db.flush()
    report = await generate(db, owner, ReportRequest(kind="general-ledger", from_date=date(2026, 1, 1), to_date=datetime.now(UTC).date()))
    page_two = await read_snapshot(db, owner, uuid.UUID(report["id"]), 2, 50)
    assert report["total"] > 50 and page_two["rows"]
    path, _, _ = await export_snapshot(db, owner, uuid.UUID(report["id"]), "csv")
    try:
        with open(path, encoding="utf-8-sig") as file:
            lines = list(csv.reader(file))
        assert len([row for row in lines if row and row[0] == "2026-01-01"]) == 54
    finally:
        os.unlink(path)


@pytest.mark.db
async def test_manual_lifecycle_and_journal_branch_permissions(db, finance):
    from pydantic import ValidationError as SchemaError

    from app.modules.accounting.schemas.transaction import TransactionUpdate
    from app.modules.accounting.service.transaction import post_transaction, update_transaction
    from app.modules.accounting.service.workspace import journal_detail
    tenant, owner, branch, a = finance
    draft = await create_transaction(db, tenant.id, owner.id, TransactionCreate(type="manual", transaction_date="2026-01-01", client_reference="MANUAL-FIN", branch_id=branch.id, lines=[{"account_id": a["1000"], "type": "debit", "amount": "10.00"}, {"account_id": a["3000"], "type": "credit", "amount": "10.00"}]))
    with pytest.raises(SchemaError):
        TransactionUpdate(status="Posted")
    staff = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="Staff", role="staff", is_superuser=False, hashed_password="x")
    db.add(staff)
    await db.flush()
    with pytest.raises(ForbiddenError):
        await update_transaction(db, tenant.id, draft.id, TransactionUpdate(description="unauthorized"), staff)
    await post_transaction(db, tenant.id, draft.id, owner.id)
    with pytest.raises(ValidationError, match="immutable"):
        await update_transaction(db, tenant.id, draft.id, TransactionUpdate(description="changed"), owner)
    other_branch = Branch(tenant_id=tenant.id, name="Other branch")
    db.add(other_branch)
    await db.flush()
    staff.is_superuser = True
    staff.branch_id = other_branch.id
    with pytest.raises(ForbiddenError):
        await journal_detail(db, staff, draft.id)


@pytest.mark.db
async def test_account_hierarchy_import_fiscal_defaults_and_tax_payment_retry(db, finance):
    from app.modules.accounting.repository.account import AccountRepository
    from app.modules.accounting.schemas.account import AccountCreate
    from app.modules.accounting.schemas.tax import TaxPaymentCreate
    from app.modules.accounting.schemas.workspace import FiscalPreference
    from app.modules.accounting.service.catalog import bulk_accounts, update_preferences
    from app.modules.accounting.service.tax import create_tax_payment
    tenant, owner, _branch, a = finance
    await bulk_accounts(db, owner, [AccountCreate(code="1601", name="Furniture", type="Assets", normal_balance="debit", parent_id=a["1500"])])
    child = await AccountRepository(db).get_by_code(tenant.id, "1601")
    with pytest.raises(ValidationError, match="cycle"):
        await update_account(db, tenant.id, a["1500"], AccountUpdate(parent_id=child.id), owner)
    await update_preferences(db, owner, FiscalPreference(fiscal_start_month=7))
    report = await generate(db, owner, ReportRequest(kind="income-statement", to_date=date(2026, 10, 18)))
    assert report["from_date"] == "2026-07-01"
    data = TaxPaymentCreate(client_reference="TAX-FIN", tax_type="vat", period="2026-10", amount=Decimal("12.34"), payment_date=date(2026, 10, 18), payment_method="cash")
    first = await create_tax_payment(db, tenant.id, data)
    second = await create_tax_payment(db, tenant.id, data)
    assert first.id == second.id
