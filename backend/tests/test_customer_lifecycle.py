"""Customer lifecycle: archive / deactivate / reactivate, safe deletion, list figures and activity."""
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order

pytestmark = pytest.mark.db


async def business(db):
    from app.modules.tenants.models import Tenant, User
    nonce = uuid.uuid4().hex
    tenant = Tenant(name="Lifecycle", slug=f"life-{nonce}")
    db.add(tenant)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"{nonce}@x.test", hashed_password="x", full_name="Owner", role="owner", is_superuser=True, is_active=True)
    db.add(owner)
    await db.flush()
    return tenant, owner


async def sale(db, tenant, owner, customer, price=1000):
    from app.modules.sales.schemas.order import OrderCreate
    from app.modules.sales.service.order import create_order
    product = Product(tenant_id=tenant.id, name="Item", sku=uuid.uuid4().hex, price=price, cost=1, stock=10)
    db.add(product)
    await db.flush()
    return await create_order(db, tenant.id, owner.id, OrderCreate(client_order_id=uuid.uuid4().hex, customer_id=customer.id, status="Completed",
                              items=[{"product_id": product.id, "product_name": "Item", "unit_price": price, "quantity": 1}]))


async def test_a_customer_with_sales_cannot_be_deleted_and_archiving_keeps_everything(db):
    from app.modules.sales.service.customer import list_customers
    from app.modules.sales.service.customer_lifecycle import (
        delete_permanently,
        dependencies,
        require_usable,
        set_status,
    )

    tenant, owner = await business(db)
    customer = Customer(tenant_id=tenant.id, name="Buyer")
    db.add(customer)
    await db.flush()
    order = await sale(db, tenant, owner, customer)
    assert (await dependencies(db, tenant.id, customer.id))["sales"] == 1
    with pytest.raises(ConflictError, match="Archive the customer instead"):
        await delete_permanently(db, tenant.id, customer.id, owner)
    assert await db.get(Customer, customer.id) is not None

    await set_status(db, tenant.id, customer.id, "archived", owner)
    assert (await db.get(Order, order.id)).customer_id == customer.id  # the sale still names its customer
    assert [c.name for c in await list_customers(db, tenant.id)] == []  # hidden from the everyday list
    assert [c.status for c in await list_customers(db, tenant.id, status="archived")] == ["archived"]
    with pytest.raises(ValidationError, match="archived"):
        await require_usable(db, tenant.id, customer.id)  # no new sales for an archived customer

    await set_status(db, tenant.id, customer.id, "active", owner)
    assert (await db.get(Customer, customer.id)).archived_at is None
    await require_usable(db, tenant.id, customer.id)
    await set_status(db, tenant.id, customer.id, "inactive", owner)
    with pytest.raises(ValidationError, match="inactive"):
        await require_usable(db, tenant.id, customer.id)


async def test_an_unused_customer_can_be_deleted_and_the_deletion_is_audited(db):
    from app.modules.audit.models.audit import AuditLog
    from app.modules.sales.service.customer_lifecycle import delete_permanently

    tenant, owner = await business(db)
    customer = Customer(tenant_id=tenant.id, name="Never bought")
    db.add(customer)
    await db.flush()
    customer_id = customer.id
    await delete_permanently(db, tenant.id, customer_id, owner)
    assert await db.get(Customer, customer_id) is None
    entry = (await db.execute(select(AuditLog).where(AuditLog.entity_type == "customer", AuditLog.entity_id == str(customer_id)))).scalar_one()
    assert entry.action == "customer.deleted"


async def test_list_figures_come_from_the_server_and_other_businesses_are_invisible(db):
    from app.modules.sales.service.customer import list_customers
    from app.modules.sales.service.customer_lifecycle import delete_permanently, set_status

    tenant, owner = await business(db)
    customer = Customer(tenant_id=tenant.id, name="Regular")
    db.add(customer)
    await db.flush()
    await sale(db, tenant, owner, customer, 1000)
    await sale(db, tenant, owner, customer, 500)
    row = (await list_customers(db, tenant.id, with_figures=True))[0]
    assert (row.orders_count, row.total_spent, row.outstanding) == (2, Decimal("1500.00"), Decimal("0.00"))
    assert row.last_order_at is not None

    other, intruder = await business(db)
    with pytest.raises(NotFoundError):
        await set_status(db, other.id, customer.id, "archived", intruder)
    with pytest.raises(NotFoundError):
        await delete_permanently(db, other.id, customer.id, intruder)


async def test_only_owners_and_administrators_may_delete():
    from app.core.deps import may_delete
    assert may_delete(SimpleNamespace(is_superuser=False, role="admin"))
    assert not may_delete(SimpleNamespace(is_superuser=False, role="sales manager"))
