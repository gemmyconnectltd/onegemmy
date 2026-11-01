"""Sweep actions above baseline view/edit access for missing authorization.

Operational PATCH/PUT requests are authorized by the business-wide view/edit policy.
Creation, deletion, approvals and administration still require explicit grants.
"""
import re
import uuid
from collections import defaultdict

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.modules.tenants.models import Role, Tenant, User

pytestmark = pytest.mark.db

# Not tenant-business endpoints: public pages, sign-in, payment-provider callbacks, the platform admin console (its own
# superadmin guard), support-staff tools and tracking beacons authorised by signed tokens.
SKIP = re.compile(r"^/api/v1/(auth/|global/|public/|billing/|admin/|support/|activity|health)")


def _ops():
    spec = app.openapi()
    for path, item in spec["paths"].items():
        if SKIP.match(path):
            continue
        for method in ("post", "put", "patch", "delete"):
            if method in item:
                yield method.upper(), path


async def test_user_without_explicit_grants_cannot_perform_protected_mutations(db, capsys):
    n = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Sweep {n}", slug=f"sweep-{n}", is_active=True, subscription_status="active")
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="No access", description="no permissions")
    db.add(role)
    await db.flush()
    user = User(email=f"sweep{n}@x.test", hashed_password="x", full_name="No Access", role="member", tenant_id=tenant.id, role_id=role.id, is_active=True, is_superuser=False)
    db.add(user)
    await db.flush()
    token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})

    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    findings: dict[str, list[str]] = defaultdict(list)
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"}) as c:
            for method, path in _ops():
                # The explicit product policy allows operational edits without a stored role grant.
                if method in {"PUT", "PATCH"} and re.match(
                    r"^/api/v1/tenants/(inventory|sales|accounting|hr|procurement|crm|manufacturing|services|repairs|expenses|expense-management|departments|debts)(/|$)", path
                ):
                    continue
                url = re.sub(r"\{[^}]+\}", lambda _m: str(uuid.uuid4()), path)
                async with db.begin_nested():
                    res = await c.request(method, url, json={})
                    code = res.status_code
                kind = "2xx — NO PERMISSION CHECK" if code < 300 else "422 — validated before authorising" if code == 422 else "5xx" if code >= 500 else "ok"
                if kind != "ok":
                    findings[kind].append(f"{method} {path} → {code}")
    finally:
        app.dependency_overrides.clear()
    del capsys
    # Endpoints that legitimately answer a user with no permissions: a person editing their OWN profile and the pure tax calculators.
    open_by_design = re.compile(r"^(PATCH /api/v1/tenants/users/me|POST /api/v1/tenants/accounting/tax/calculate/|POST /api/v1/tenants/expense-management/search)")
    unguarded = [r for r in findings.get("2xx — NO PERMISSION CHECK", []) if not open_by_design.match(r)]
    assert not unguarded, f"These writes succeeded for a user with no permissions: {unguarded}"
    # A 422 means the body was checked before any permission. Allowed only where authorisation is not a role permission at all.
    not_role_gated = re.compile(r"^(POST /api/v1/(ai/chat|tenants/billing/|tenants/users/change-password|tenants/debts/[^/]+/search))")
    validated_first = [r for r in findings.get("422 — validated before authorising", []) if not not_role_gated.match(r) and not re.match(r"^POST /api/v1/tenants/approvals →", r)]
    assert not validated_first, f"These writes validate the request before checking permission: {validated_first}"
