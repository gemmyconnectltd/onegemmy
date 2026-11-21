"""Business role, direct API authorization and branch reporting regressions."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal as D
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.core.deps import get_active_branch_id
from app.core.exceptions import ForbiddenError
from app.modules.inventory.routes.access import inventory_access
from app.modules.reporting.service.daily import daily_report, export_report
from app.modules.tenants.models import Branch, Tenant, User
from app.modules.tenants.repository import RoleRepository
from app.modules.tenants.service.role import seed_default_roles


def request(method, path, body=b"{}"):
    async def receive():
        return {"type": "http.request", "body": body}
    return Request({"type": "http", "method": method, "path": path,
                    "headers": [(b"content-type", b"application/json")]}, receive)


async def test_stock_view_does_not_grant_stock_modifications():
    viewer = SimpleNamespace(id=uuid.uuid4(), role="viewer", is_superuser=False, permissions_names=["items:read", "stock:read", "items:update"])
    await inventory_access(request("GET", "/inventory/reports/valuation"), viewer)
    with pytest.raises(ForbiddenError):
        await inventory_access(request("PATCH", "/inventory/products/anything", b'{"stock":10}'), viewer)
    with pytest.raises(ForbiddenError):
        await inventory_access(request("POST", "/inventory/products/anything/restock"), viewer)


@pytest.mark.db
async def test_branch_assignment_isolation_and_consolidated_report(db):
    tenant = Tenant(name="Wholesale", slug=uuid.uuid4().hex, currency="USD", timezone="Africa/Kigali")
    other = Tenant(name="Other", slug=uuid.uuid4().hex)
    db.add_all([tenant, other])
    await db.flush()
    a, b = [Branch(tenant_id=tenant.id, name=name) for name in ("A", "B")]
    foreign = Branch(tenant_id=other.id, name="Foreign")
    db.add_all([a, b, foreign])
    await db.flush()
    user = User(tenant_id=tenant.id, email=f"{uuid.uuid4()}@example.test", hashed_password="x", full_name="Manager", is_superuser=True, branch_ids=[str(a.id), str(b.id)])
    db.add(user)
    await db.flush()
    assert await get_active_branch_id(user, db, a.id) == a.id
    with pytest.raises(ForbiddenError):
        await get_active_branch_id(user, db, foreign.id)
    with pytest.raises(ForbiddenError):
        await daily_report(db, user, None, None, foreign.id)
    from app.modules.sales.models.order import Order
    now = datetime.now(UTC)
    db.add_all([Order(tenant_id=tenant.id, order_number=f"ORD-{i}", branch_id=branch.id, status="Completed", total=D(10), ordered_at=now) for i, branch in enumerate((a, b), 1)])
    await db.flush()
    report = await daily_report(db, user, None, None, None)
    assert report["totals"]["sales"] == D(20)
    assert report["totals"]["bank"] == 0 and report["totals"]["momo"] == 0 and report["totals"]["deposits"] == 0
    assert report["metrics"] == ["stock_value", "sales", "customer_credit", "expenses", "deposits", "bank", "momo"]
    assert report["currency"] == "USD" and report["timezone"] == "Africa/Kigali"
    scoped = await daily_report(db, user, None, None, a.id)
    assert scoped["totals"]["sales"] == D(10)
    assert b"20.00" in export_report(report, "csv")
    assert export_report(report, "pdf").startswith(b"%PDF-")
    user.branch_ids = [str(a.id)]
    assert (await daily_report(db, user, None, None, None))["totals"]["sales"] == D(10)


@pytest.mark.db
async def test_role_templates_preserve_revoked_permissions(db):
    tenant = Tenant(name="Retail", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    await seed_default_roles(db, tenant.id)
    roles = await RoleRepository(db).list_for_tenant(tenant.id, 0, 100)
    by_name = {role.name: role for role in roles}
    assert {"Owner/CEO", "General Manager", "Branch Manager", "Factory Manager", "Viewer"} <= by_name.keys()
    by_name["Viewer"].permissions.clear()
    await db.flush()
    await seed_default_roles(db, tenant.id)
    assert not by_name["Viewer"].permissions
    assert any(p.name == "work_orders:approve" for p in by_name["Factory Manager"].permissions)
    assert not any(p.name.startswith("work_orders:") for p in by_name["Branch Manager"].permissions)


@pytest.mark.db
async def test_direct_api_stock_permissions_branch_isolation_and_module_gate(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select

    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app
    from app.modules.sales.models.order import Order
    from app.modules.tenants.models import Permission, Role
    from app.modules.tenants.service.role import ensure_permissions_seeded

    tenant = Tenant(name="Single branch retail", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    a, b = [Branch(tenant_id=tenant.id, name=name) for name in ("Assigned", "Restricted")]
    db.add_all([a, b])
    await db.flush()
    await ensure_permissions_seeded(db)
    permissions = list((await db.scalars(select(Permission).where(Permission.name.in_([
        "items:read", "items:update", "stock:read", "orders:read",
    ])))).all())
    role = Role(tenant_id=tenant.id, name="Read stock", permissions=permissions)
    user = User(tenant_id=tenant.id, email=f"{uuid.uuid4()}@example.test", full_name="Viewer",
                hashed_password="x", branch_id=a.id, role_rel=role)
    private_order = Order(tenant_id=tenant.id, order_number="ORD-1", branch_id=b.id, status="Pending")
    db.add_all([user, private_order])
    await db.flush()

    async def feature(_db, _tenant, key):
        return key != "manufacturing"

    async def module_status(_db, _tenant, key):
        return "not_included" if key == "manufacturing" else "enabled"

    async def current():
        return user

    async def session():
        yield db

    from app.modules.tenants import service
    monkeypatch.setattr(service, "feature_enabled", feature)
    monkeypatch.setattr(service, "module_status", module_status)
    old = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = current
    app.dependency_overrides[get_db] = session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            valuation = await client.get("/api/v1/tenants/inventory/reports/valuation")
            assert valuation.status_code == 200
            denied = await client.patch(f"/api/v1/tenants/inventory/products/{uuid.uuid4()}", json={"stock": 10})
            assert denied.status_code == 403
            private = await client.get(f"/api/v1/tenants/sales/orders/{private_order.id}")
            assert private.status_code == 403
            listed = await client.get("/api/v1/tenants/sales/orders")
            assert listed.status_code == 200 and listed.json()["data"]["total"] == 0
            manufacturing = await client.get("/api/v1/tenants/manufacturing/orders")
            assert manufacturing.status_code == 403
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(old)


def test_document_membership_respects_multiple_branch_assignments():
    from app.core.branches import branch_allowed, has_branch_restriction
    a, b, other = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    user = SimpleNamespace(branch_id=None, branch_ids=[str(a), str(b)])
    assert has_branch_restriction(user)
    assert branch_allowed(user, a) and branch_allowed(user, b)
    assert not branch_allowed(user, other) and not branch_allowed(user, None)


@pytest.mark.db
async def test_owner_daily_sheet_stock_value_deposit_and_bank_momo(db):
    """The owner's sheet per branch: closing stock value, sales, debt, expense, deposit (cash banked), Bank and MoMo apart."""
    from datetime import date, timedelta

    from app.modules.accounting.models.account import Account
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.models.transaction_line import TransactionLine
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.models.warehouse import StockMovement, Warehouse
    from app.modules.sales.models.order import Order
    from app.modules.sales.models.order_payment import OrderPayment

    tenant = Tenant(name="Depot", slug=uuid.uuid4().hex, currency="RWF", timezone="Africa/Kigali")
    db.add(tenant)
    await db.flush()
    main, quiet = Branch(tenant_id=tenant.id, name="Kigali"), Branch(tenant_id=tenant.id, name="Huye")
    db.add_all([main, quiet])
    await db.flush()
    owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4()}@example.test", hashed_password="x", full_name="Owner", is_superuser=True)
    store = Warehouse(tenant_id=tenant.id, code="KGL", name="Kigali shop", branch_id=main.id)
    paper = Product(tenant_id=tenant.id, name="A4 paper", cost=D(3000), price=D(5000))
    cash, bank = (Account(tenant_id=tenant.id, code=c, name=n, type="Assets", normal_balance="debit") for c, n in (("1000", "Cash"), ("1010", "Bank")))
    db.add_all([owner, store, paper, cash, bank])
    await db.flush()
    now = datetime.now(UTC)
    today = now.astimezone(__import__("zoneinfo").ZoneInfo("Africa/Kigali")).date()
    db.add_all([StockMovement(tenant_id=tenant.id, warehouse_id=store.id, product_id=paper.id, quantity=D(10), movement_type="opening", created_at=now - timedelta(days=3)),
                StockMovement(tenant_id=tenant.id, warehouse_id=store.id, product_id=paper.id, quantity=D(-2), movement_type="sale", created_at=now)])
    sale = Order(tenant_id=tenant.id, order_number="ORD-1", branch_id=main.id, status="Completed", total=D(10000), ordered_at=now)
    db.add(sale)
    await db.flush()
    db.add_all([OrderPayment(tenant_id=tenant.id, reference="P1", order_id=sale.id, branch_id=main.id, amount=D(4000), payment_method="mobile", paid_at=now),
                OrderPayment(tenant_id=tenant.id, reference="P2", order_id=sale.id, branch_id=main.id, amount=D(1500), payment_method="card", paid_at=now),
                OrderPayment(tenant_id=tenant.id, reference="P3", order_id=sale.id, branch_id=main.id, amount=D(4500), payment_method="cash", paid_at=now)])
    banked = Transaction(tenant_id=tenant.id, reference="TR-1", type="cash_transfer", status="Posted", transaction_date=today, branch_id=main.id)
    db.add(banked)
    await db.flush()
    db.add_all([TransactionLine(transaction_id=banked.id, account_id=cash.id, type="credit", amount=D(5000)),
                TransactionLine(transaction_id=banked.id, account_id=bank.id, type="debit", amount=D(5000))])
    await db.flush()

    report = await daily_report(db, owner, today, today, None)
    rows = {r["branch"]: r for r in report["items"]}
    assert set(rows) == {"Kigali", "Huye"}  # one day lists every branch, even one that sold nothing
    kigali = rows["Kigali"]
    assert kigali["sales"] == D(10000) and kigali["momo"] == D(4000) and kigali["bank"] == D(1500) and kigali["deposits"] == D(5000)
    assert kigali["stock_value"] == D(24000)  # 8 sheets left x 3,000
    assert rows["Huye"]["sales"] == 0 and rows["Huye"]["stock_value"] == 0
    assert report["totals"]["stock_value"] == D(24000)
    yesterday = await daily_report(db, owner, today - timedelta(days=1), today - timedelta(days=1), main.id)
    assert yesterday["items"][0]["stock_value"] == D(30000)  # before today's sale
    assert date.fromisoformat(str(report["to_date"])) == today
    period = await daily_report(db, owner, today - timedelta(days=6), today, None, by_branch=True)
    lines = {r["branch"]: r for r in period["items"]}
    assert set(lines) == {"Kigali", "Huye"}  # one line per branch for the whole period
    assert lines["Kigali"]["sales"] == D(10000) and lines["Kigali"]["stock_value"] == D(24000)  # closing value on the last day
