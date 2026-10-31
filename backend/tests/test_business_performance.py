"""Business performance: server-side totals for any period, comparison without invented numbers, branch scoping, cost honesty."""
import uuid
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.models.expense import Expense
from app.modules.reporting.service.performance import (
    grain_for,
    performance,
    previous_period,
    same_period_last_year,
)
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.tenants.models import Branch, Tenant

pytestmark = pytest.mark.db


def person(tenant, branches=None, permissions=("orders:read", "expenses:read")):
    return SimpleNamespace(tenant_id=tenant.id, is_superuser=False, branch_ids=branches, branch_id=None, permissions_names=list(permissions))


async def business(db):
    tenant = Tenant(name="Shop", slug=uuid.uuid4().hex, timezone="Africa/Kigali", currency="RWF")
    db.add(tenant)
    await db.flush()
    main, second = Branch(tenant_id=tenant.id, name="Main"), Branch(tenant_id=tenant.id, name="Second")
    db.add_all([main, second])
    await db.flush()
    return tenant, main, second


async def sale(db, tenant, branch, day, total, tax=0, cost=None, status="Completed", number=None):
    order = Order(tenant_id=tenant.id, branch_id=branch.id, order_number=number or uuid.uuid4().hex[:8], status=status, subtotal=total, total=total, tax=tax,
                  ordered_at=datetime(day.year, day.month, day.day, 10, tzinfo=UTC))
    db.add(order)
    await db.flush()
    db.add(OrderItem(order_id=order.id, product_name="Widget", unit_price=total, quantity=1, line_total=total, cost_at_sale=cost))
    await db.flush()


def test_grain_and_comparison_periods():
    assert [grain_for(d) for d in (1, 31, 90, 400, 2000)] == ["day", "day", "week", "month", "year"]
    assert previous_period(date(2026, 3, 1), date(2026, 3, 31)) == (date(2026, 1, 29), date(2026, 2, 28))
    assert same_period_last_year(date(2026, 1, 1), date(2026, 6, 30)) == (date(2025, 1, 1), date(2025, 6, 30))
    assert same_period_last_year(date(2024, 2, 29), date(2024, 2, 29)) == (date(2023, 2, 28), date(2023, 2, 28))


async def test_totals_profit_comparison_and_branch_scope(db):
    tenant, main, second = await business(db)
    await sale(db, tenant, main, date(2026, 3, 10), 1180, tax=180, cost=600)
    await sale(db, tenant, second, date(2026, 3, 12), 500, cost=200)
    await sale(db, tenant, main, date(2026, 3, 12), 9999, status="Cancelled", cost=1)
    await sale(db, tenant, main, date(2026, 2, 10), 1000, cost=400)
    db.add(Expense(tenant_id=tenant.id, branch_id=main.id, reference="E1", title="Rent", amount=300, expense_date=date(2026, 3, 11), category="Rent", status="Approved"))
    db.add(Expense(tenant_id=tenant.id, branch_id=main.id, reference="E2", title="Draft", amount=999, expense_date=date(2026, 3, 11), category="Rent", status="Pending"))
    await db.flush()

    r = await performance(db, person(tenant), date(2026, 3, 1), date(2026, 3, 31), None, "previous")
    c = r["current"]
    assert (c["sales"], c["orders"], c["tax"], c["expenses"]) == (1680, 2, 180, 300)  # cancelled sale and pending expense are excluded
    assert c["gross_profit"] == 1680 - 180 - 800 and c["net_profit"] == 700 - 300
    assert r["comparison"]["has_data"] and r["comparison"]["changes"]["sales"]["percent"] == 68.0
    assert sum(point["sales"] for point in r["series"]) == 1680 and r["grain"] == "day"
    assert {b["name"] for b in r["by_branch"]} == {"Main", "Second"}

    only_main = await performance(db, person(tenant, branches=[main.id]), date(2026, 3, 1), date(2026, 3, 31), None)
    assert only_main["current"]["sales"] == 1180 and [b["name"] for b in only_main["by_branch"]] == ["Main"]
    with pytest.raises(ForbiddenError):
        await performance(db, person(tenant, branches=[main.id]), date(2026, 3, 1), date(2026, 3, 31), second.id)


async def test_no_invented_comparison_and_profit_hidden_when_cost_is_missing(db):
    tenant, main, _ = await business(db)
    await sale(db, tenant, main, date(2026, 3, 10), 1000, cost=None)
    r = await performance(db, person(tenant, permissions=("orders:read",)), date(2026, 3, 1), date(2026, 3, 31), None, "year")
    assert r["comparison"]["has_data"] is False and r["comparison"]["changes"] == {}
    assert r["current"]["gross_profit"] is None and r["current"]["items_missing_cost"] == 1
    assert r["current"]["expenses"] is None and r["can_see_expenses"] is False  # no expense permission, nothing leaked
    assert any("no recorded cost" in i["text"] for i in r["insights"])


async def test_rejects_backwards_ranges_and_missing_permission(db):
    tenant, *_ = await business(db)
    with pytest.raises(ValidationError):
        await performance(db, person(tenant), date(2026, 4, 1), date(2026, 3, 1), None)
    with pytest.raises(ForbiddenError):
        await performance(db, person(tenant, permissions=()), date(2026, 3, 1), date(2026, 3, 31), None)
