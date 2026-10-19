"""Raw materials, wastage and finished goods post atomically and only once."""
import uuid

import pytest
from sqlalchemy import select

from app.core.exceptions import ConflictError, ValidationError
from app.modules.inventory.models.product import Product
from app.modules.manufacturing.schemas import (
    ProductionItemCreate,
    ProductionOrderCreate,
    ProductionOrderUpdate,
)
from app.modules.manufacturing.service.production_order import (
    complete_production_order,
    create_production_order,
    update_production_order,
)
from app.modules.tenants.models import Tenant

pytestmark = pytest.mark.db


async def factory(db):
    tenant = Tenant(name="Factory", slug=uuid.uuid4().hex, features={"manufacturing": True})
    db.add(tenant)
    await db.flush()
    raw = Product(tenant_id=tenant.id, name="Raw material", stock=10, cost=2)
    finished = Product(tenant_id=tenant.id, name="Finished goods", stock=0, cost=8)
    db.add_all([raw, finished])
    await db.flush()
    return tenant, raw, finished


async def test_wastage_and_duplicate_components_are_consumed_once(db):
    tenant, raw, finished = await factory(db)
    order = await create_production_order(db, tenant.id, ProductionOrderCreate(
        product_id=finished.id, quantity=2,
        items=[ProductionItemCreate(product_id=raw.id, quantity_required=3, wastage_quantity=1),
               ProductionItemCreate(product_id=raw.id, quantity_required=2)],
    ))
    result = await complete_production_order(db, tenant.id, order.id)
    assert result.status == "Completed"
    assert await db.scalar(select(Product.stock).where(Product.id == raw.id)) == 4
    assert await db.scalar(select(Product.stock).where(Product.id == finished.id)) == 2
    with pytest.raises(ConflictError):
        await complete_production_order(db, tenant.id, order.id)
    with pytest.raises(ConflictError):
        await update_production_order(db, tenant.id, order.id, ProductionOrderUpdate(quantity=99))


async def test_aggregate_shortage_and_completed_create_cannot_bypass_stock(db):
    tenant, raw, finished = await factory(db)
    with pytest.raises(ValidationError):
        await create_production_order(db, tenant.id, ProductionOrderCreate(product_id=finished.id, status="Completed"))
    order = await create_production_order(db, tenant.id, ProductionOrderCreate(
        product_id=finished.id, quantity=1,
        items=[ProductionItemCreate(product_id=raw.id, quantity_required=6),
               ProductionItemCreate(product_id=raw.id, quantity_required=6)],
    ))
    with pytest.raises(ValidationError):
        await complete_production_order(db, tenant.id, order.id)
    assert await db.scalar(select(Product.stock).where(Product.id == raw.id)) == 10
    assert await db.scalar(select(Product.stock).where(Product.id == finished.id)) == 0
