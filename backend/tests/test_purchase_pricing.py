"""Purchase price instructions are permission checked and applied atomically at receipt."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.audit.models import AuditLog
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.models.variant import ProductVariant
from app.modules.procurement.repository.purchase import PurchaseOrderRepository
from app.modules.procurement.schemas.purchase import (
    PurchaseCreate,
    PurchaseItemCreate,
    PurchaseUpdate,
)
from app.modules.procurement.service import purchase
from app.modules.tenants.models import Branch, Tenant, User


@pytest.fixture
async def context(db):
    tenant = Tenant(name="Purchase price test", slug=uuid.uuid4().hex, currency="USD")
    db.add(tenant)
    await db.flush()
    actor = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="Purchase tester", role="owner", hashed_password="x", is_superuser=True)
    member = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="Limited tester", role="member", hashed_password="x", is_superuser=False)
    supplier = Supplier(tenant_id=tenant.id, name="Price supplier")
    branch = Branch(tenant_id=tenant.id, name="Purchase branch")
    product = Product(tenant_id=tenant.id, name="Price product", sku="PRICE-TEST", price=20, cost=10, stock=5)
    db.add_all([actor, member, supplier, branch, product])
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    return tenant, actor, member, supplier, branch, product


def line(product, **overrides):
    return PurchaseItemCreate(**{"product_id": product.id, "product_name": product.name, "unit_cost": "12.50", "quantity": "2", "update_catalog_cost": True, "selling_price": "25", **overrides})


@pytest.mark.db
async def test_draft_price_edit_receive_and_audit_preserve_historical_values(db, context):
    tenant, actor, member, supplier, branch, product = context
    item = line(product)
    with pytest.raises(ForbiddenError):
        await purchase.create_purchase(db, tenant.id, member.id, PurchaseCreate(supplier_id=supplier.id, items=[item]), branch.id)
    created = await purchase.create_purchase(db, tenant.id, actor.id, PurchaseCreate(supplier_id=supplier.id, items=[item]), branch.id)
    assert created.items[0].selling_price == Decimal(25)
    await db.refresh(product)
    assert product.cost == 10 and product.price == 20 and product.stock == 5
    changed = await purchase.update_purchase(db, tenant.id, created.id, PurchaseUpdate(items=[line(product, unit_cost="13", selling_price="26")]), actor.id)
    assert changed.total == 26 and len(changed.items) == 1
    assert changed.items[0].unit_cost == 13
    with pytest.raises(ForbiddenError):
        await purchase.receive_purchase(db, tenant.id, created.id, member.id)
    received = await purchase.receive_purchase(db, tenant.id, created.id, actor.id)
    await db.refresh(product)
    assert received.status == "Received"
    assert product.stock == 7 and product.cost == 13 and product.price == 26
    with pytest.raises(ValidationError):
        await purchase.receive_purchase(db, tenant.id, created.id, actor.id)
    with pytest.raises(ValidationError):
        await purchase.update_purchase(db, tenant.id, created.id, PurchaseUpdate(items=[item]), actor.id)
    audit = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "purchase.receive", AuditLog.entity_id == str(created.id)))).scalar_one()
    change = audit.changes["price_changes"][0]
    assert Decimal(change["previous_cost"]) == 10 and Decimal(change["new_cost"]) == 13
    assert Decimal(change["previous_price"]) == 20 and Decimal(change["new_price"]) == 26
    assert (await purchase.get_purchase(db, tenant.id, created.id)).items[0].unit_cost == 13
    repo = PurchaseOrderRepository(db)
    found = await repo.list_for_tenant(tenant.id, search="Price supplier", branch_id=branch.id, from_date=datetime.now(UTC).date(), limit=1)
    assert len(found) == 1
    assert await repo.count_for_tenant(tenant.id, search="no match", branch_id=branch.id) == 0
    assert (await repo.history_summary(tenant.id, branch_id=branch.id))["counts"]["Received"] == 1


@pytest.mark.db
async def test_variant_price_updates_conversion_and_default_no_repricing(db, context):
    tenant, actor, _member, supplier, branch, product = context
    product.has_variants = True
    product.conversion_factor = 2
    variant = ProductVariant(product_id=product.id, attributes={"Size": "Large"}, sku="PRICE-L", cost=10, price=20, stock=0)
    db.add(variant)
    await db.flush()
    created = await purchase.create_purchase(db, tenant.id, actor.id, PurchaseCreate(supplier_id=supplier.id, items=[line(product, variant_id=variant.id, unit_cost="30", quantity="1", selling_price="40")]), branch.id)
    await purchase.receive_purchase(db, tenant.id, created.id, actor.id)
    await db.refresh(variant)
    await db.refresh(product)
    assert variant.stock == 2 and variant.cost == 15 and variant.price == 40
    assert product.price == 20 and product.cost == 10
    other = await purchase.create_purchase(db, tenant.id, actor.id, PurchaseCreate(supplier_id=supplier.id, items=[line(product, variant_id=variant.id, unit_cost="50", quantity="1", update_catalog_cost=False, selling_price=None)]), branch.id)
    await purchase.receive_purchase(db, tenant.id, other.id, actor.id)
    await db.refresh(variant)
    assert variant.stock == 4 and variant.cost == 15 and variant.price == 40
