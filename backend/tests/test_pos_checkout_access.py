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


@pytest.mark.db
async def test_a_past_sale_needs_a_manager_and_a_future_date_is_refused(db, monkeypatch):
    from datetime import UTC, datetime, timedelta
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", False)
    tenant = Tenant(name="Past sale test", slug=uuid.uuid4().hex, currency="RWF", is_active=True, subscription_status="active", timezone="UTC")
    db.add(tenant)
    await db.flush()
    branch = Branch(tenant_id=tenant.id, name="Main", is_main=True)
    role = Role(tenant_id=tenant.id, name="Cashier", permissions=[])
    product = Product(tenant_id=tenant.id, name="Thing", price=100, cost=50, stock=50)
    db.add_all([branch, role, product])
    await db.flush()
    cashier = User(tenant_id=tenant.id, full_name="Cashier", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                   is_superuser=False, role="cashier", role_id=role.id, branch_id=branch.id, branch_ids=[str(branch.id)])
    owner = User(tenant_id=tenant.id, full_name="Owner", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True, is_superuser=True, role="owner")
    db.add_all([cashier, owner])
    await db.flush()
    await seed_default_accounts(db, tenant.id)

    async def session():
        yield db

    app.dependency_overrides[get_db] = session

    def body(when):
        return {"status": "Completed", "client_order_id": uuid.uuid4().hex, "payment_method": "cash", "amount_paid": 100, "amount_tendered": 100,
                "ordered_at": when.isoformat(), "items": [{"product_id": str(product.id), "product_name": "Thing", "unit_price": 100, "quantity": 1}]}

    now = datetime.now(UTC)
    try:
        for user, expect_past in ((cashier, 403), (owner, 201)):
            token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})
            async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test",
                                   headers={"Authorization": f"Bearer {token}", "X-Branch-Id": str(branch.id)}) as client:
                past = await client.post("/api/v1/tenants/sales/orders", json=body(now - timedelta(days=3)))
                assert past.status_code == expect_past, past.text
                if expect_past == 201:
                    assert past.json()["data"]["ordered_at"].startswith((now - timedelta(days=3)).strftime("%Y-%m-%d"))
                today = await client.post("/api/v1/tenants/sales/orders", json=body(now - timedelta(minutes=5)))
                assert today.status_code == 201, today.text  # earlier today is a normal sale for everyone
                future = await client.post("/api/v1/tenants/sales/orders", json=body(now + timedelta(days=2)))
                assert future.status_code in (400, 422), future.text
    finally:
        app.dependency_overrides.clear()


async def _till(db, monkeypatch, *, credit=False):
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", False)
    tenant = Tenant(name="Split test", slug=uuid.uuid4().hex, currency="RWF", is_active=True, subscription_status="active", timezone="UTC")
    db.add(tenant)
    await db.flush()
    branch = Branch(tenant_id=tenant.id, name="Main", is_main=True)
    role = Role(tenant_id=tenant.id, name="Cashier", permissions=[])
    product = Product(tenant_id=tenant.id, name="Thing", price=1000, cost=500, stock=50)
    db.add_all([branch, role, product])
    await db.flush()
    cashier = User(tenant_id=tenant.id, full_name="Cashier", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                   is_superuser=not credit and False, role="cashier", role_id=role.id, branch_id=branch.id, branch_ids=[str(branch.id)])
    owner = User(tenant_id=tenant.id, full_name="Owner", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True, is_superuser=True, role="owner")
    db.add_all([cashier, owner])
    await db.flush()
    await seed_default_accounts(db, tenant.id)

    async def session():
        yield db

    app.dependency_overrides[get_db] = session
    return tenant, branch, product, cashier, owner


def _client(user, tenant, branch):
    token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test",
                       headers={"Authorization": f"Bearer {token}", "X-Branch-Id": str(branch.id)})


@pytest.mark.db
async def test_split_payment_is_one_sale_with_linked_payments_and_validates_references(db, monkeypatch):
    from sqlalchemy import select

    from app.modules.sales.models.order_payment import OrderPayment
    tenant, branch, product, _, owner = await _till(db, monkeypatch)
    sale = {"status": "Completed", "items": [{"product_id": str(product.id), "product_name": "Thing", "unit_price": 1000, "quantity": 10}]}
    try:
        async with _client(owner, tenant, branch) as c:
            missing = await c.post("/api/v1/tenants/sales/orders", json={**sale, "client_order_id": uuid.uuid4().hex, "payments": [
                {"method": "cash", "amount": 6000}, {"method": "mobile", "amount": 4000}]})
            assert missing.status_code == 422 and "reference" in missing.text  # an unverified mobile payment is not accepted
            over = await c.post("/api/v1/tenants/sales/orders", json={**sale, "client_order_id": uuid.uuid4().hex, "payments": [
                {"method": "cash", "amount": 9000}, {"method": "mobile", "amount": 4000, "reference": "MP1"}]})
            assert over.status_code == 422
            ok = await c.post("/api/v1/tenants/sales/orders", json={**sale, "client_order_id": uuid.uuid4().hex, "payments": [
                {"method": "cash", "amount": 6000, "tendered": 6500}, {"method": "mobile", "amount": 4000, "reference": "MP-123"}]})
            assert ok.status_code == 201, ok.text
            body = ok.json()["data"]
            assert body["payment_status"] == "Paid" and body["amount_paid"] == 10000 and body["payment_method"] == "split"
            rows = (await db.execute(select(OrderPayment).where(OrderPayment.order_id == uuid.UUID(body["id"])))).scalars().all()
            assert sorted((r.payment_method, float(r.amount), r.reference_number) for r in rows) == [("cash", 6000.0, None), ("mobile", 4000.0, "MP-123")]
            await db.refresh(product)
            assert float(product.stock) == 40  # stock left once, for the one sale
            # part payment across two methods leaves a debt, which needs a customer and a due date
            debt = await c.post("/api/v1/tenants/sales/orders", json={**sale, "client_order_id": uuid.uuid4().hex, "payments": [
                {"method": "cash", "amount": 3000}, {"method": "mobile", "amount": 2000, "reference": "MP-9"}]})
            assert debt.status_code == 422 and "customer" in debt.text.lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_selling_on_credit_needs_the_credit_permission(db, monkeypatch):
    from app.modules.sales.models.customer import Customer
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    buyer = Customer(tenant_id=tenant.id, name="Buyer")
    db.add(buyer)
    await db.flush()
    credit = {"status": "Completed", "customer_id": str(buyer.id), "due_date": "2099-01-01", "amount_paid": 0, "payment_method": "cash",
              "items": [{"product_id": str(product.id), "product_name": "Thing", "unit_price": 1000, "quantity": 1}]}
    try:
        async with _client(cashier, tenant, branch) as c:
            refused = await c.post("/api/v1/tenants/sales/orders", json={**credit, "client_order_id": uuid.uuid4().hex})
            assert refused.status_code == 403 and "credit" in refused.text.lower()
        async with _client(owner, tenant, branch) as c:
            allowed = await c.post("/api/v1/tenants/sales/orders", json={**credit, "client_order_id": uuid.uuid4().hex})
            assert allowed.status_code == 201, allowed.text
            assert allowed.json()["data"]["outstanding_balance"] == 1000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_credit_sale_that_takes_a_client_over_the_debt_limit_waits_for_approval(db, monkeypatch):
    from app.modules.sales.models.customer import Customer
    tenant, branch, product, cashier, owner = await _till(db, monkeypatch)
    tenant.debt_limit_per_client = 5000
    buyer = Customer(tenant_id=tenant.id, name="Heavy Buyer")
    db.add(buyer)
    await db.flush()
    cashier.is_superuser = False
    credit = {"status": "Completed", "customer_id": str(buyer.id), "due_date": "2099-01-01", "amount_paid": 0, "payment_method": "cash"}

    def sale(qty):
        return {**credit, "client_order_id": uuid.uuid4().hex, "items": [{"product_id": str(product.id), "product_name": "Thing", "unit_price": 1000, "quantity": qty}]}
    try:
        async with _client(owner, tenant, branch) as c:
            assert (await c.post("/api/v1/tenants/sales/orders", json=sale(4))).json()["data"]["status"] == "Completed"  # 4,000 owed: under the limit
            over = await c.post("/api/v1/tenants/sales/orders", json=sale(2))  # an approver may go over the limit
            assert over.status_code == 201 and over.json()["data"]["status"] == "Completed"
            await db.refresh(product)
            assert float(product.stock) == 44
        # a seller with the credit permission but no approval authority is held at the limit: nothing sold, nothing posted
        from sqlalchemy import select

        from app.modules.tenants.models import Permission
        from app.modules.tenants.service import ensure_permissions_seeded
        await ensure_permissions_seeded(db, )
        grant = (await db.execute(select(Permission).where(Permission.name == "credit:create"))).scalar_one()
        seller_role = Role(tenant_id=tenant.id, name="Credit Seller", permissions=[grant])
        db.add(seller_role)
        await db.flush()
        cashier.role_id = seller_role.id
        await db.flush()
        await db.refresh(cashier, ["role_rel"])
        async with _client(cashier, tenant, branch) as c:
            held = await c.post("/api/v1/tenants/sales/orders", json=sale(1))
            assert held.status_code == 201, held.text
            assert held.json()["data"]["status"] == "Awaiting Approval"
            await db.refresh(product)
            assert float(product.stock) == 44  # a held sale takes no stock
    finally:
        app.dependency_overrides.clear()
