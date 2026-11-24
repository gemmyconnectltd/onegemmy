"""Reports: "All branches" on the page covers every branch, even while the workspace is set to one branch (X-Branch-Id).
A branch-limited person still only sees their own branch."""
import uuid

import pytest
from sqlalchemy import select

from app.main import app
from app.modules.tenants.models import Branch, Role, User
from app.modules.tenants.service.role import ensure_permissions_seeded
from tests.test_sales_team import API, team


@pytest.mark.db
async def test_all_branches_is_not_narrowed_to_the_workspace_branch(db, monkeypatch):
    tenant, _ann, _ben, owner, client, sale = await team(db, monkeypatch)
    main = (await db.execute(select(Branch).where(Branch.tenant_id == tenant.id))).scalar_one()
    ju = Branch(tenant_id=tenant.id, name="QA-ju")
    catalog = {p.name: p for p in await ensure_permissions_seeded(db)}
    role = Role(tenant_id=tenant.id, name="QA-Seller", permissions=[catalog[n] for n in ("orders:create", "orders:read", "pos:create", "pos:read", "reports:read")])
    db.add_all([ju, role])
    await db.flush()
    seller = User(tenant_id=tenant.id, full_name="QA-Seller ju", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                  is_superuser=False, role="member", role_id=role.id, branch_id=ju.id)
    db.add(seller)
    await db.flush()
    try:
        async with client(owner) as c:  # the owner's workspace header is the Main branch (see team())
            assert (await c.post(f"{API}/sales/orders", json=sale(1))).status_code == 201
        async with client(seller) as c:
            assert (await c.post(f"{API}/sales/orders", json=sale(2))).status_code == 201  # sold in ju

        async with client(owner) as c:
            def sellers(r):
                assert r.status_code == 200, r.text
                return {row["salesperson"] for row in r.json()["data"]["people"]}
            everyone = sellers(await c.get(f"{API}/reports/salespeople", params={"all_branches": "true"}))
            assert {"Owner", "QA-Seller ju"} <= everyone
            assert "QA-Seller ju" not in sellers(await c.get(f"{API}/reports/salespeople"))  # no choice made: the workspace branch, as before
            assert sellers(await c.get(f"{API}/reports/salespeople", params={"branch_id": str(ju.id)})) == {"QA-Seller ju"}
        async with client(seller) as c:  # limited to ju: "all branches" is still only ju
            assert (await c.get(f"{API}/reports/salespeople", params={"all_branches": "true"})).json()["data"]["people"][0]["salesperson"] == "QA-Seller ju"
            assert (await c.get(f"{API}/reports/salespeople", params={"branch_id": str(main.id)})).status_code == 403
    finally:
        app.dependency_overrides.clear()
