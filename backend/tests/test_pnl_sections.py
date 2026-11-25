"""One rule for "other income" everywhere (accounting/service/pnl_sections.py): the P&L sections and subtotals, the Overview
dashboard split, Business Reports net profit, the Daily report's Other income column and branch filtering all agree.

The real case: an account in the 41xx range (which the code-range fallback reports as sales) is used for non-sale income,
posted, and only then classified as other income. Classifying it moves it between report sections and changes no journal."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core.exceptions import ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.schemas import AccountCreate, AccountUpdate
from app.modules.accounting.schemas.workspace import IncomeReceipt
from app.modules.accounting.service import pnl_sections
from app.modules.accounting.service.account import (
    create_account,
    seed_default_accounts,
    update_account,
)
from app.modules.accounting.service.dashboard import revenue_summary
from app.modules.accounting.service.operations import income_receipt
from app.modules.accounting.service.statements import income_statement
from app.modules.accounting.service.transaction import post_transaction
from app.modules.reporting.service.daily import daily_report
from app.modules.reporting.service.performance import performance
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.tenants.models import Branch, Tenant, User

pytestmark = pytest.mark.db
DAY, NOV_1, NOV_30 = date(2026, 11, 10), date(2026, 11, 1), date(2026, 11, 30)


def test_fallback_and_classification_rule():
    assert pnl_sections.section("Revenue", "4000", None) == "sales"
    assert pnl_sections.section("Revenue", "4100", None) == "sales"  # 41xx is service revenue unless classified
    assert pnl_sections.section("Revenue", "4100", "other_income") == "other_income"
    assert pnl_sections.section("Revenue", "4910", None) == "other_income"
    assert pnl_sections.section("Expense", "5000", None) == "cogs"
    assert pnl_sections.section("Expense", "5900", None) == "other_expense"
    assert pnl_sections.section("Expense", "5100", None) == "operating"
    assert pnl_sections.section("Assets", "1000", "other_income") is None
    with pytest.raises(ValidationError):
        pnl_sections.validate("Revenue", "cogs")
    with pytest.raises(ValidationError):
        pnl_sections.validate("Assets", "other_income")


@pytest.fixture
async def books(db):
    tenant = Tenant(name="QA-Depot", slug=uuid.uuid4().hex, currency="USD", vat_enabled=False, timezone="Africa/Kigali")
    db.add(tenant)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="QA-Owner", role="owner", is_superuser=True, hashed_password="x")
    hq, musanze = Branch(tenant_id=tenant.id, name="QA-Kigali HQ", is_main=True), Branch(tenant_id=tenant.id, name="QA-Musanze")
    db.add_all([owner, hq, musanze])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    # a non-sale income account in the 41xx range, created without a classification (as on staging)
    rent = await create_account(db, tenant.id, AccountCreate(code="4150", name="QA-Other Income", type="Revenue", normal_balance="credit"))
    a = {x.code: x.id for x in (await db.execute(select(Account).where(Account.tenant_id == tenant.id))).scalars()}

    async def journal(branch, *lines):
        txn = Transaction(tenant_id=tenant.id, reference=f"J-{uuid.uuid4().hex[:8]}", type="manual", status="Posted", transaction_date=DAY,
                          branch_id=branch.id, currency_code="USD")
        db.add(txn)
        await db.flush()
        db.add_all([TransactionLine(transaction_id=txn.id, account_id=a[code], type=side, amount=Decimal(amount)) for code, side, amount in lines])
        await db.flush()

    # HQ: a sale of 1,000 that cost 600 (orders for Business Reports, the same sale in the ledger for the P&L)
    order = Order(tenant_id=tenant.id, branch_id=hq.id, order_number="QA-INV-0001", status="Completed", subtotal=1000, total=1000, tax=0,
                  ordered_at=datetime(2026, 11, 10, 9, tzinfo=UTC))
    db.add(order)
    await db.flush()
    db.add(OrderItem(order_id=order.id, product_name="QA-Widget", unit_price=1000, quantity=1, line_total=1000, cost_at_sale=600))
    await journal(hq, ("1000", "debit", 1000), ("4000", "credit", 1000))
    await journal(hq, ("5000", "debit", 600), ("1200", "credit", 600))
    # HQ: an approved running cost of 300 (Expenses module for Business Reports, its journal for the P&L)
    db.add(Expense(tenant_id=tenant.id, branch_id=hq.id, reference="QA-E1", title="QA-Rent", amount=300, expense_date=DAY, category="Rent", status="Approved"))
    await journal(hq, ("5100", "debit", 300), ("1000", "credit", 300))
    # Musanze: an other expense of 100
    await journal(musanze, ("5900", "debit", 100), ("1000", "credit", 100))
    await db.flush()
    # HQ: Accounting → Income → Add Income, 500 into the bank on the 41xx account, then Post
    receipt = await income_receipt(db, owner, IncomeReceipt(client_reference=uuid.uuid4().hex, transaction_date=DAY, description="QA-Rent received",
                                                            amount=Decimal(500), cash_account_id=a["1010"], revenue_account_id=rent.id, branch_id=hq.id))
    await post_transaction(db, tenant.id, receipt.id, owner.id)
    return SimpleNamespace(tenant=tenant, owner=owner, hq=hq, musanze=musanze, rent=rent, a=a)


def person(b, branches=None):
    return SimpleNamespace(tenant_id=b.tenant.id, is_superuser=False, branch_ids=branches, branch_id=None,
                           permissions_names=["orders:read", "expenses:read", "journal_entries:read"])


async def classify_rent(db, b):
    return await update_account(db, b.tenant.id, b.rent.id, AccountUpdate(pnl_section="other_income"), actor=b.owner)


async def test_classifying_a_posted_account_moves_it_to_other_income_without_touching_journals(db, books):
    b = books
    before = await income_statement(db, b.tenant.id, NOV_1, NOV_30)
    assert "4150" in [l.code for l in before.revenue_accounts] and before.total_other_income == 0  # 41xx fallback: sales
    lines_before = (await db.execute(select(TransactionLine.amount).where(TransactionLine.account_id == b.rent.id))).scalars().all()

    read = await classify_rent(db, b)  # allowed although the account is posted
    assert read.pnl_section == "other_income" and read.reported_section == "other_income"
    after = await income_statement(db, b.tenant.id, NOV_1, NOV_30)
    assert [l.code for l in after.other_income] == ["4150"] and "4150" not in [l.code for l in after.revenue_accounts]
    assert after.total_revenue == before.total_revenue - 500 == 1000
    assert after.gross_profit == before.gross_profit - 500 == 400
    assert after.operating_income == 100 and after.total_other_income == 500 and after.total_other_expenses == 100
    assert after.net_income == before.net_income == 500  # Sales − COGS − Opex + Other income − Other expenses: 1000−600−300+500−100
    assert [l.code for l in after.other_expense_accounts] == ["5900"]
    lines_after = (await db.execute(select(TransactionLine.amount).where(TransactionLine.account_id == b.rent.id))).scalars().all()
    assert lines_after == lines_before  # reporting only: no journal changes

    with pytest.raises(ValidationError):
        await update_account(db, b.tenant.id, b.rent.id, AccountUpdate(pnl_section="cogs"), actor=b.owner)


async def test_dashboard_business_reports_and_pnl_agree_per_branch(db, books):
    b = books
    await classify_rent(db, b)
    # Overview dashboard: the same split as the P&L
    hq = await revenue_summary(db, b.owner, NOV_1, NOV_30, b.hq.id)
    assert (Decimal(hq["sales_revenue"]), Decimal(hq["other_income"])) == (Decimal(1000), Decimal(500))
    assert Decimal((await revenue_summary(db, b.owner, NOV_1, NOV_30, b.musanze.id))["other_income"]) == 0
    assert Decimal((await revenue_summary(db, b.owner, NOV_1, NOV_30, None))["other_income"]) == 500

    # Business Reports net profit for HQ equals the dashboard/P&L profit for HQ
    pnl = await income_statement(db, b.tenant.id, NOV_1, NOV_30, b.hq.id)
    dashboard_profit = Decimal(hq["total_revenue"]) - pnl.total_cogs - pnl.total_operating_expenses - pnl.total_other_expenses
    report = await performance(db, person(b), NOV_1, NOV_30, b.hq.id)
    assert report["current"]["other_income"] == 500
    assert Decimal(str(report["current"]["net_profit"])) == dashboard_profit == pnl.net_income == 600
    assert sum(p["profit"] for p in report["series"]) == 600  # the trend adds up to the same profit
    assert [r["other_income"] for r in report["by_branch"]] == [500]

    everywhere = await performance(db, person(b), NOV_1, NOV_30, None)
    assert {r["name"]: r["other_income"] for r in everywhere["by_branch"]}["QA-Kigali HQ"] == 500
    assert (await performance(db, person(b), NOV_1, NOV_30, b.musanze.id))["current"]["other_income"] == 0

    # Without access to Accounting journals, other income is not shown and not added
    hidden = await performance(db, SimpleNamespace(**{**vars(person(b)), "permissions_names": ["orders:read", "expenses:read"]}), NOV_1, NOV_30, b.hq.id)
    assert hidden["current"]["other_income"] is None and hidden["current"]["net_profit"] == 100


async def test_daily_report_other_income_column_and_bank_stays_sales_only(db, books):
    b = books
    await classify_rent(db, b)
    day = await daily_report(db, b.owner, DAY, DAY, None)
    rows = {r["branch"]: r for r in day["items"]}
    assert "other_income" in day["metrics"]
    assert Decimal(rows["QA-Kigali HQ"]["other_income"]) == 500 and Decimal(rows["QA-Musanze"]["other_income"]) == 0
    assert Decimal(rows["QA-Kigali HQ"]["bank"]) == 0  # the 500 went into the bank but is other income, not a sale payment
    assert Decimal(day["totals"]["other_income"]) == 500
    only_musanze = await daily_report(db, b.owner, DAY, DAY, b.musanze.id)
    assert Decimal(only_musanze["totals"]["other_income"]) == 0
