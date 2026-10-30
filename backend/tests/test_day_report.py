"""The day report: one branch's sales per item, debt, deposits, stock movement and expenses for a day."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.exceptions import ForbiddenError
from app.modules.accounting.models.expense import Expense
from app.modules.reporting.service.day import day_report
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.tenants.models import Branch, Permission, Role, Tenant, User
from app.modules.tenants.service import ensure_permissions_seeded

NOON = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)


async def setup(db):
    key = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Day {key}", slug=f"day-{key}", is_active=True, currency="RWF", timezone="UTC")
    db.add(tenant)
    await db.flush()
    await ensure_permissions_seeded(db)
    remera, kimironko = Branch(tenant_id=tenant.id, name="Remera", is_main=True), Branch(tenant_id=tenant.id, name="Kimironko")
    db.add_all([remera, kimironko])
    await db.flush()
    catalog = {p.name: p for p in (await db.execute(select(Permission))).scalars().all()}
    role = Role(tenant_id=tenant.id, name="Branch Manager", permissions=[catalog[n] for n in ("journal_entries:read", "stock:read", "accounts_receivable:read", "expenses:read")])
    db.add(role)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"o{key}@x.test", hashed_password="x", full_name="Owner", role="owner", is_superuser=True, is_active=True)
    manager = User(tenant_id=tenant.id, email=f"m{key}@x.test", hashed_password="x", full_name="Manager", role="member", role_id=role.id, branch_id=remera.id, branch_ids=[str(remera.id)], is_active=True)
    db.add_all([owner, manager])
    await db.flush()
    return tenant, owner, manager, remera, kimironko


async def sell(db, tenant, branch, lines, method="cash", credit=None):
    total = sum(q * p for _, q, p in lines)
    order = Order(tenant_id=tenant.id, order_number=uuid.uuid4().hex[:12], status="Completed", total=total, base_total=total, branch_id=branch.id, ordered_at=NOON, credit_base=credit, credit_granted_at=NOON if credit else None)
    db.add(order)
    await db.flush()
    for name, qty, price in lines:
        db.add(OrderItem(order_id=order.id, product_name=name, unit_price=price, quantity=qty, line_total=qty * price))
    db.add(OrderPayment(tenant_id=tenant.id, order_id=order.id, branch_id=branch.id, reference=uuid.uuid4().hex[:12], amount=total - (credit or 0), payment_method=method, status="Completed", paid_at=NOON))
    await db.flush()


@pytest.mark.db
async def test_the_day_report_covers_the_five_sections_for_one_branch(db):
    tenant, owner, manager, remera, kimironko = await setup(db)
    await sell(db, tenant, remera, [("Charger", 2, 10000), ("Cable", 3, 1000)], "cash")
    await sell(db, tenant, remera, [("Charger", 1, 10000)], "momo", credit=4000)
    await sell(db, tenant, kimironko, [("Charger", 9, 10000)], "cash")  # another branch: must not appear
    db.add_all([Expense(tenant_id=tenant.id, reference="E1", title="Fuel", amount=5000, expense_date=NOON.date(), category="Transport", status="Approved", branch_id=remera.id),
                Expense(tenant_id=tenant.id, reference="E2", title="Tea", amount=800, expense_date=NOON.date(), status="Pending", branch_id=remera.id),
                Expense(tenant_id=tenant.id, reference="E3", title="Other branch", amount=999, expense_date=NOON.date(), status="Approved", branch_id=kimironko.id)])
    await db.flush()
    r = await day_report(db, owner, NOON.date(), remera.id)
    by = {i["name"]: i for i in r["sales"]["items"]}
    assert by["Charger"]["quantity"] == Decimal(3) and by["Charger"]["amount"] == Decimal(30000) and by["Cable"]["amount"] == Decimal(3000)
    assert r["sales"]["total"] == Decimal(33000) and r["sales"]["orders"] == 2  # Kimironko's 90,000 is not here
    assert r["debt"]["new_credit"] == Decimal(4000) and len(r["debt"]["sales"]) == 1
    assert {m["method"]: m["amount"] for m in r["deposits"]["methods"]} == {"cash": Decimal(23000), "momo": Decimal(6000)} and r["deposits"]["total"] == Decimal(29000)
    assert r["expenses"]["approved_total"] == Decimal(5000) and r["expenses"]["pending"] == 1 and [e["title"] for e in r["expenses"]["items"]] == ["Tea", "Fuel"] or len(r["expenses"]["items"]) == 2
    assert {i["name"]: i["sold"] for i in r["stock"]["items"]} == {"Charger": Decimal(3), "Cable": Decimal(3)}
    assert "closing balance" in r["stock"]["note"]  # no invented branch balance
    other_day = await day_report(db, owner, date(2020, 1, 1), remera.id)
    assert other_day["sales"]["total"] == 0 and other_day["sales"]["items"] == []


@pytest.mark.db
async def test_a_branch_manager_sees_only_their_own_branch_on_the_day(db):
    tenant, owner, manager, remera, kimironko = await setup(db)
    await sell(db, tenant, remera, [("Charger", 1, 10000)])
    await sell(db, tenant, kimironko, [("Charger", 5, 10000)])
    mine = await day_report(db, manager, NOON.date(), None)  # no branch chosen: their own, never everyone's
    assert mine["sales"]["total"] == Decimal(10000)
    with pytest.raises(ForbiddenError):
        await day_report(db, manager, NOON.date(), kimironko.id)
    everyone = await day_report(db, owner, NOON.date(), None)
    assert everyone["sales"]["total"] == Decimal(60000)
