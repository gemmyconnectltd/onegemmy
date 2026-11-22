"""Lists load only what they return: a customer's history, a product's serials and each order line's product are never
pulled in with a list, however much history a business has."""
import uuid
from collections import Counter
from contextlib import contextmanager
from datetime import UTC, datetime

import pytest
from sqlalchemy import event

from app.core.database import Base
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.serial import ProductSerial
from app.modules.inventory.service.product import get_product, list_products
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.service.customer import get_customer, list_customers
from app.modules.sales.service.order import get_order, list_orders
from app.modules.tenants.models import Tenant

pytestmark = pytest.mark.db
HISTORY = 30


@contextmanager
def loaded():
    """Counts the rows of each model loaded from the database while the block runs."""
    counts: Counter = Counter()

    def on_load(target, _context):
        counts[type(target).__name__] += 1
    event.listen(Base, "load", on_load, propagate=True)
    try:
        yield counts
    finally:
        event.remove(Base, "load", on_load)


async def business_with_history(db):
    tenant = Tenant(name="History", slug=uuid.uuid4().hex, timezone="UTC", currency="RWF")
    db.add(tenant)
    await db.flush()
    phone = Product(tenant_id=tenant.id, name="Phone", stock=HISTORY, cost=100, price=150)
    loyal = Customer(tenant_id=tenant.id, name="Loyal customer")
    db.add_all([phone, loyal])
    await db.flush()
    db.add_all([ProductSerial(tenant_id=tenant.id, product_id=phone.id, serial_number=f"SN-{i}") for i in range(HISTORY)])
    for i in range(HISTORY):
        order = Order(tenant_id=tenant.id, order_number=f"H-{i}", status="Completed", customer_id=loyal.id, subtotal=150, total=150,
                      ordered_at=datetime(2026, 3, 1, 9, tzinfo=UTC))
        db.add(order)
        await db.flush()
        db.add(OrderItem(order_id=order.id, product_id=phone.id, product_name="Phone", unit_price=150, quantity=1, line_total=150))
    await db.flush()
    db.expunge_all()  # read back from the database, as a request would
    return tenant, phone, loyal


async def test_customer_list_and_detail_do_not_load_the_customers_history(db):
    tenant, _, loyal = await business_with_history(db)
    with loaded() as counts:
        rows = await list_customers(db, tenant.id, 0, 500, with_figures=True)
        detail = await get_customer(db, tenant.id, loyal.id)
    assert [r.name for r in rows] == ["Loyal customer"] and detail.name == "Loyal customer"
    assert rows[0].orders_count == HISTORY  # the figures still come from SQL aggregates
    assert counts["Order"] == counts["OrderItem"] == counts["Deal"] == counts["Return"] == 0


async def test_product_list_and_detail_do_not_load_serials(db):
    tenant, phone, _ = await business_with_history(db)
    with loaded() as counts:
        await list_products(db, tenant.id, 0, 500)
        await get_product(db, tenant.id, phone.id)
    assert counts["ProductSerial"] == 0 and counts["WarrantyClaim"] == 0


async def test_order_list_loads_lines_but_not_products_or_the_customers_other_orders(db):
    tenant, _, _ = await business_with_history(db)
    with loaded() as counts:
        page = await list_orders(db, tenant.id, offset=0, limit=5)
    assert len(page) == 5 and all(len(o.items) == 1 and o.customer.name == "Loyal customer" for o in page)
    assert counts["Order"] == 5  # not the customer's other 25
    assert counts["Product"] == counts["ProductSerial"] == 0
    with loaded() as counts:
        detail = await get_order(db, tenant.id, page[0].id)
    assert detail.items[0].product_name == "Phone"  # the single-order view still has everything it needs
