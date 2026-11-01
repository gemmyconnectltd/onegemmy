"""A business user's checkout works without widening other financial actions."""
import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.inventory.models.product import Product
from app.modules.tenants.models import Branch, Role, Tenant, User


@pytest.mark.db
async def test_empty_branch_manager_role_can_charge_once_but_not_import_refund_or_cross_branch(db, monkeypatch):
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", False)
    tenant = Tenant(name="Checkout access test", slug=uuid.uuid4().hex,
                    currency="RWF", is_active=True, subscription_status="active")
    db.add(tenant)
    await db.flush()
    branch = Branch(tenant_id=tenant.id, name="Assigned branch", is_main=True)
    other = Branch(tenant_id=tenant.id, name="Unassigned branch")
    role = Role(tenant_id=tenant.id, name="Branch Manager", permissions=[])
    product = Product(tenant_id=tenant.id, name="Checkout product", price=100, cost=50, stock=10)
    db.add_all([branch, other, role, product])
    await db.flush()
    user = User(tenant_id=tenant.id, full_name="Branch manager", email=f"{uuid.uuid4().hex}@example.test",
        hashed_password="x", is_active=True, is_superuser=False, role="branch manager",
        role_id=role.id, branch_id=branch.id, branch_ids=[str(branch.id)])
    db.add(user)
    await db.flush()
    await seed_default_accounts(db, tenant.id)
    token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})

    async def session():
        yield db

    app.dependency_overrides[get_db] = session
    body = {"status": "Completed", "client_order_id": uuid.uuid4().hex,
        "payment_method": "cash", "amount_paid": 200, "amount_tendered": 200,
        "items": [{"product_id": str(product.id), "product_name": product.name,
                   "unit_price": 100, "quantity": 2}]}
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test", headers={"Authorization": f"Bearer {token}",
                                            "X-Branch-Id": str(branch.id)}) as client:
            charged = await client.post("/api/v1/tenants/sales/orders", json=body)
            assert charged.status_code == 201, charged.text
            sale = charged.json()["data"]
            assert sale["status"] == "Completed" and sale["branch_id"] == str(branch.id)
            retried = await client.post("/api/v1/tenants/sales/orders", json=body)
            assert retried.status_code == 201 and retried.json()["data"]["id"] == sale["id"]
            await db.refresh(product)
            assert product.stock == Decimal(8)
            for path in ["/sales/orders/bulk", "/sales/returns", f"/sales/orders/{sale['id']}/approve"]:
                response = await client.post(f"/api/v1/tenants{path}", json={})
                assert response.status_code == 403, (path, response.text)
            wrong_branch = await client.post("/api/v1/tenants/sales/orders", json={**body, "client_order_id": uuid.uuid4().hex},
                headers={"X-Branch-Id": str(other.id)})
            assert wrong_branch.status_code == 403
            await db.refresh(product)
            assert product.stock == Decimal(8)
    finally:
        app.dependency_overrides.clear()
