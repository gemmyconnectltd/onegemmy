"""Sales tabs and branches: Returns and Quotations follow the workspace branch like Sales History, and staff limited to one branch
only ever see (and open) their own branch's records."""
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.security import create_access_token
from app.main import app
from app.modules.sales.models.order import Order
from app.modules.sales.models.quotation import Quotation
from app.modules.sales.models.return_ import Return
from app.modules.tenants.models import Branch, Role, User
from app.modules.tenants.service.role import ensure_permissions_seeded
from tests.test_sales_team import API, team


@pytest.mark.db
async def test_returns_and_quotations_follow_the_branch(db, monkeypatch):
    tenant, _ann, _ben, owner, client, sale = await team(db, monkeypatch)
    main = (await db.execute(select(Branch).where(Branch.tenant_id == tenant.id))).scalar_one()
    ju = Branch(tenant_id=tenant.id, name="QA-ju")
    catalog = {p.name: p for p in await ensure_permissions_seeded(db)}
    role = Role(tenant_id=tenant.id, name="QA-Seller", permissions=[catalog[n] for n in ("orders:create", "orders:read", "returns:read", "pos:create", "pos:read")])
    db.add_all([ju, role])
    await db.flush()
    seller = User(tenant_id=tenant.id, full_name="QA-Seller ju", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                  is_superuser=False, role="member", role_id=role.id, branch_id=ju.id)
    db.add(seller)
    await db.flush()
    async with client(owner) as c:
        main_sale = (await c.post(f"{API}/sales/orders", json=sale(1))).json()["data"]["id"]
    async with client(seller) as c:
        ju_sale = (await c.post(f"{API}/sales/orders", json=sale(1))).json()["data"]["id"]
    returns, quotes = {}, {}
    for name, branch, order_id in (("main", main, main_sale), ("ju", ju, ju_sale)):
        r = Return(tenant_id=tenant.id, return_number=f"QA-RET-{name}", return_date=datetime.now(UTC).date(), order_id=uuid.UUID(order_id), status="Pending")
        q = Quotation(tenant_id=tenant.id, quote_number=f"QA-QT-{name}", issue_date=datetime.now(UTC).date(), branch_id=branch.id, created_by=owner.id)
        db.add_all([r, q])
        await db.flush()
        returns[name], quotes[name] = str(r.id), str(q.id)
    assert (await db.get(Order, uuid.UUID(ju_sale))).branch_id == ju.id

    def numbers(r, key):
        assert r.status_code == 200, r.text
        return {i[key] for i in r.json()["data"]["items"]}
    try:
        async with client(owner) as c:  # workspace = Main
            assert numbers(await c.get(f"{API}/sales/returns"), "return_number") == {"QA-RET-main"}
            assert numbers(await c.get(f"{API}/sales/quotations"), "quote_number") == {"QA-QT-main"}
        token = create_access_token(str(owner.id), {"tenant_id": str(tenant.id)})
        from httpx import ASGITransport, AsyncClient
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t",
                               headers={"Authorization": f"Bearer {token}"}) as c:  # workspace = all branches
            assert {"QA-RET-main", "QA-RET-ju"} <= numbers(await c.get(f"{API}/sales/returns"), "return_number")
            assert {"QA-QT-main", "QA-QT-ju"} <= numbers(await c.get(f"{API}/sales/quotations"), "quote_number")
        async with client(seller) as c:  # limited to ju, whatever header is sent
            assert numbers(await c.get(f"{API}/sales/returns"), "return_number") == {"QA-RET-ju"}
            assert numbers(await c.get(f"{API}/sales/quotations"), "quote_number") == {"QA-QT-ju"}
            assert (await c.get(f"{API}/sales/returns/{returns['main']}")).status_code == 404
            assert (await c.get(f"{API}/sales/returns/{returns['ju']}")).status_code == 200
            assert (await c.get(f"{API}/sales/quotations/{quotes['main']}")).status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_sales_team_performance_works_without_report_access(db, monkeypatch):
    tenant, _ann, _ben, owner, client, sale = await team(db, monkeypatch)
    ju = Branch(tenant_id=tenant.id, name="QA-ju")
    catalog = {p.name: p for p in await ensure_permissions_seeded(db)}
    role = Role(tenant_id=tenant.id, name="QA-Sales Manager",
                permissions=[catalog[n] for n in ("orders:create", "orders:read", "orders:approve", "pos:create", "pos:read")])
    db.add_all([ju, role])
    await db.flush()
    manager = User(tenant_id=tenant.id, full_name="QA-Manager ju", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                   is_superuser=False, role="sales manager", role_id=role.id, branch_id=ju.id, disabled_modules=["reports"])
    db.add(manager)
    await db.flush()
    async with client(owner) as c:
        await c.post(f"{API}/sales/orders", json=sale(1))  # Main branch
    try:
        async with client(manager) as c:
            await c.post(f"{API}/sales/orders", json=sale(2))  # ju
            assert (await c.get(f"{API}/reports/salespeople")).status_code == 403  # Business Reports stays closed
            r = await c.get(f"{API}/sales/team-performance", params={"all_branches": "true"})
            assert r.status_code == 200, r.text
            assert [p["salesperson"] for p in r.json()["data"]["people"]] == ["QA-Manager ju"]  # only their branch
    finally:
        app.dependency_overrides.clear()
