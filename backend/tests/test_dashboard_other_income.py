"""Other income on the Overview dashboard: posted revenue on any Revenue account other than the sales account, net of
VAT, for the same period and branch as the rest of the dashboard, and always equal (with sales) to the Income page's
"Posted revenue"."""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.schemas.workspace import IncomeReceipt
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.accounting.service.dashboard import income, revenue_summary
from app.modules.accounting.service.operations import income_receipt
from app.modules.accounting.service.transaction import post_transaction, void_transaction
from app.modules.tenants.models import Branch, Tenant, User

pytestmark = pytest.mark.db
NOV_1, NOV_23, NOV_30 = date(2026, 11, 1), date(2026, 11, 23), date(2026, 11, 30)


@pytest.fixture
async def shop(db):
    tenant = Tenant(name="Other income shop", slug=uuid.uuid4().hex, currency="RWF", vat_enabled=True, timezone="Africa/Kigali")
    db.add(tenant)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="Owner", role="owner", is_superuser=True, hashed_password="x")
    main, other = Branch(tenant_id=tenant.id, name="Main Branch", is_main=True), Branch(tenant_id=tenant.id, name="Other Branch")
    db.add_all([owner, main, other])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    accounts = {a.code: a.id for a in (await db.execute(select(Account).where(Account.tenant_id == tenant.id))).scalars()}
    return tenant, owner, main, other, accounts


async def sale(db, tenant, accounts, branch, day, net, status="Posted"):
    """A completed sale as the sales posting records it: revenue on 4000, VAT on 2100, cash on 1000."""
    vat = (net * Decimal("0.18")).quantize(Decimal("0.01"))
    txn = Transaction(tenant_id=tenant.id, reference=f"S-{uuid.uuid4().hex[:8]}", type="sale", status=status, transaction_date=day, branch_id=branch.id, currency_code="RWF")
    db.add(txn)
    await db.flush()
    db.add_all([TransactionLine(transaction_id=txn.id, account_id=accounts["1000"], type="debit", amount=net + vat),
                TransactionLine(transaction_id=txn.id, account_id=accounts["4000"], type="credit", amount=net),
                TransactionLine(transaction_id=txn.id, account_id=accounts["2100"], type="credit", amount=vat)])
    await db.flush()


async def other_income(db, owner, accounts, branch, day, amount, *, vat=False, post=True):
    """Accounting > Income > Add Income to 4900 Other Income, received into 1010 Bank."""
    receipt = await income_receipt(db, owner, IncomeReceipt(client_reference=uuid.uuid4().hex, transaction_date=day, description="Other income",
                                                            amount=amount, cash_account_id=accounts["1010"], revenue_account_id=accounts["4900"],
                                                            apply_vat=vat, vat_account_id=accounts["2100"] if vat else None, branch_id=branch.id))
    if post:
        await post_transaction(db, owner.tenant_id, receipt.id, owner.id)
    return receipt


async def test_real_case_txn_0034_other_income_and_void(db, shop):
    tenant, owner, main, _, a = shop
    await sale(db, tenant, a, main, NOV_23, Decimal(2593200))
    txn = await other_income(db, owner, a, main, NOV_23, Decimal(1000000))
    month = await revenue_summary(db, owner, NOV_1, NOV_30, main.id)
    assert Decimal(month["sales_revenue"]) == Decimal(2593200)  # unchanged
    assert Decimal(month["other_income"]) == Decimal(1000000)
    assert Decimal(month["total_revenue"]) == Decimal(3593200)
    assert [(r["date"], Decimal(r["amount"])) for r in month["other_income_by_day"]] == [(NOV_23.isoformat(), Decimal(1000000))]
    await void_transaction(db, tenant.id, txn.id, owner.id)
    after = await revenue_summary(db, owner, NOV_1, NOV_30, main.id)
    assert Decimal(after["other_income"]) == 0 and Decimal(after["sales_revenue"]) == Decimal(2593200)


async def test_only_posted_income_counts(db, shop):
    tenant, owner, main, _, a = shop
    await other_income(db, owner, a, main, NOV_23, Decimal(500))
    await other_income(db, owner, a, main, NOV_23, Decimal(700), post=False)  # draft
    await sale(db, tenant, a, main, NOV_23, Decimal(900), status="Void")
    month = await revenue_summary(db, owner, NOV_1, NOV_30, main.id)
    assert (Decimal(month["other_income"]), Decimal(month["sales_revenue"])) == (Decimal(500), Decimal(0))


async def test_other_income_excludes_vat(db, shop):
    _, owner, main, _, a = shop
    await other_income(db, owner, a, main, NOV_23, Decimal(118), vat=True)  # 100 income + 18 VAT
    assert Decimal((await revenue_summary(db, owner, NOV_1, NOV_30, main.id))["other_income"]) == Decimal(100)


async def test_branch_scope(db, shop):
    _, owner, main, other, a = shop
    await other_income(db, owner, a, main, NOV_23, Decimal(300))
    await other_income(db, owner, a, other, NOV_23, Decimal(200))
    assert Decimal((await revenue_summary(db, owner, NOV_1, NOV_30, main.id))["other_income"]) == Decimal(300)
    assert Decimal((await revenue_summary(db, owner, NOV_1, NOV_30, other.id))["other_income"]) == Decimal(200)
    assert Decimal((await revenue_summary(db, owner, NOV_1, NOV_30, None))["other_income"]) == Decimal(500)  # all branches


async def test_period_boundaries(db, shop):
    _, owner, main, _, a = shop
    for day, amount in [(date(2026, 10, 31), "1"), (NOV_1, "10"), (NOV_30, "100"), (date(2026, 12, 1), "1000")]:
        await other_income(db, owner, a, main, day, Decimal(amount))
    month = await revenue_summary(db, owner, NOV_1, NOV_30, main.id)
    assert Decimal(month["other_income"]) == Decimal(110)  # the first and last day count, the days around them do not


async def test_total_revenue_equals_income_page_posted_revenue(db, shop):
    tenant, owner, main, _, a = shop
    await sale(db, tenant, a, main, NOV_1, Decimal("1234.50"))
    await sale(db, tenant, a, main, NOV_30, Decimal("99.99"))
    await other_income(db, owner, a, main, NOV_23, Decimal(250))
    await other_income(db, owner, a, main, NOV_23, Decimal(40), post=False)
    dashboard = await revenue_summary(db, owner, NOV_1, NOV_30, main.id)
    page = await income(db, owner, start=NOV_1, end=NOV_30, active_branch=main.id)
    assert Decimal(dashboard["total_revenue"]) == Decimal(page["totals"]["posted"]) == Decimal("1584.49")


async def test_single_day_series_by_posting_hour(db, shop):
    _, owner, main, _, a = shop
    await other_income(db, owner, a, main, NOV_23, Decimal(75))
    day = await revenue_summary(db, owner, NOV_23, NOV_23, main.id)
    assert sum(Decimal(r["amount"]) for r in day["other_income_by_hour"]) == Decimal(75)
    assert all(0 <= r["hour"] <= 23 for r in day["other_income_by_hour"])
    assert (await revenue_summary(db, owner, NOV_1, NOV_30, main.id))["other_income_by_hour"] == []  # only for one day
