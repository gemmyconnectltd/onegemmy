"""Sales, operations and financial report breakdowns: right totals, honest profit, permission-gated sections."""
import uuid
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.models.expense import Expense
from app.modules.inventory.models.category import Category
from app.modules.inventory.models.product import Product
from app.modules.reporting.service.breakdowns import financial, operations, sales_breakdown
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.tenants.models import Tenant

pytestmark = pytest.mark.db
ALL = ("orders:read", "items:read", "contacts:read", "expenses:read", "accounts_receivable:read", "purchase_orders:read")


def person(tenant, permissions=ALL):
    return SimpleNamespace(tenant_id=tenant.id, is_superuser=False, branch_ids=None, branch_id=None, permissions_names=list(permissions))


async def shop(db):
    tenant = Tenant(name="Shop", slug=uuid.uuid4().hex, timezone="UTC", currency="RWF")
    db.add(tenant)
    await db.flush()
    drinks = Category(tenant_id=tenant.id, name="Drinks")
    db.add(drinks)
    await db.flush()
    cola = Product(tenant_id=tenant.id, name="Cola", stock=2, min_stock=5, cost=100, category_id=drinks.id)
    dust = Product(tenant_id=tenant.id, name="Dusty", stock=10, min_stock=1, cost=50)
    db.add_all([cola, dust])
    alice = Customer(tenant_id=tenant.id, name="Alice", created_at=datetime(2026, 3, 2, tzinfo=UTC))
    db.add(alice)
    await db.flush()
    async def sale(day, product, name, qty, price, cost, customer=None):
        order = Order(tenant_id=tenant.id, order_number=uuid.uuid4().hex[:8], status="Completed", subtotal=qty * price, total=qty * price,
                      customer_id=customer.id if customer else None, ordered_at=datetime(2026, 3, day, 9, tzinfo=UTC))
        db.add(order)
        await db.flush()
        db.add(OrderItem(order_id=order.id, product_id=product.id, product_name=name, unit_price=price, quantity=qty, line_total=qty * price, cost_at_sale=cost))
    await sale(5, cola, "Cola", 3, 200, 100, alice)
    await sale(6, cola, "Cola", 1, 200, 100)
    db.add(Expense(tenant_id=tenant.id, reference="E1", title="Rent", amount=400, expense_date=date(2026, 3, 7), category="Rent", status="Approved"))
    db.add(Expense(tenant_id=tenant.id, reference="E2", title="Fuel", amount=100, expense_date=date(2026, 3, 8), category="Transport", status="Approved"))
    await db.flush()
    return tenant


async def test_sales_by_product_category_and_customer_with_profit(db):
    t = await shop(db)
    march = (date(2026, 3, 1), date(2026, 3, 31))
    by_product = await sales_breakdown(db, person(t), *march, None, "product")
    cola = by_product["rows"][0]
    assert cola["name"] == "Cola"
    assert (cola["sales"], cola["orders"], cola["quantity"], cola["gross_profit"], cola["margin"]) == (800, 2, 4, 400, 50.0)
    assert (await sales_breakdown(db, person(t), *march, None, "category"))["rows"][0]["name"] == "Drinks"
    customers = {r["name"]: r for r in (await sales_breakdown(db, person(t), *march, None, "customer"))["rows"]}
    assert customers["Alice"]["sales"] == 600 and customers["Walk-in customers"]["sales"] == 200
    with pytest.raises(ValidationError):
        await sales_breakdown(db, person(t), *march, None, "nonsense")
    with pytest.raises(ForbiddenError):
        await sales_breakdown(db, person(t, permissions=()), *march, None, "product")


async def test_operations_sections_follow_permissions(db):
    t = await shop(db)
    march = (date(2026, 3, 1), date(2026, 3, 31))
    r = await operations(db, person(t), *march, None)
    inv = r["inventory"]
    assert [p["name"] for p in inv["low"]] == ["Cola"] and inv["fast_moving"][0]["name"] == "Cola" and [p["name"] for p in inv["slow_moving"]] == ["Dusty"]
    assert r["customers"]["new_customers"] == 1 and r["customers"]["buying_customers"] == 1 and r["customers"]["returning"] == 0
    narrow = await operations(db, person(t, permissions=("orders:read",)), *march, None)
    assert narrow["inventory"] is None and narrow["customers"] is None and narrow["purchases"] is None  # no partial leaks


async def test_financial_expenses_by_category_with_shares(db):
    t = await shop(db)
    r = await financial(db, person(t), date(2026, 3, 1), date(2026, 3, 31), None)
    assert r["expenses_total"] == 500 and [c["name"] for c in r["by_category"]] == ["Rent", "Transport"] and r["by_category"][0]["share"] == 80.0
    assert r["largest"][0]["title"] == "Rent"
    with pytest.raises(ForbiddenError):
        await financial(db, person(t, permissions=("orders:read",)), date(2026, 3, 1), date(2026, 3, 31), None)
