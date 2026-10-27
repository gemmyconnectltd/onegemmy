"""Platform Usage drill-downs reconcile with the overview and keep one definition per metric."""
import json
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.admin import routes, usage
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant, User

PAGE = SimpleNamespace(page=1, page_size=100, offset=0, limit=100)


def body(response):
    return json.loads(response.body)["data"]


async def make_tenant(db, name, currency="XTS", orders=0, cancelled=0, amount=100):
    tenant = Tenant(name=name, slug=uuid.uuid4().hex, currency=currency)
    db.add(tenant)
    await db.flush()
    db.add(User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name="U", role="owner", hashed_password="x"))
    for i in range(orders):
        db.add(Order(tenant_id=tenant.id, order_number=f"{tenant.slug[:6]}-{i}", status="Completed", total=amount, base_total=amount,
                     ordered_at=datetime.now(UTC) - timedelta(days=1)))
    for i in range(cancelled):
        db.add(Order(tenant_id=tenant.id, order_number=f"{tenant.slug[:6]}-x{i}", status="Cancelled", total=999, base_total=999,
                     ordered_at=datetime.now(UTC)))
    await db.flush()
    return tenant


@pytest.mark.db
async def test_engagement_list_reconciles_with_overview_tiers(db):
    await make_tenant(db, "Dormant Co", orders=0)
    light = await make_tenant(db, "Light Co", orders=3)
    await make_tenant(db, "Moderate Co", orders=10)
    overview = (await routes.admin_usage_breakdown(db, None)).body
    counts = {row["tier"]: row["tenants"] for row in json.loads(overview)["data"]["engagement"]}
    for category in usage.TIERS:
        listed = body(await usage.engagement_list(category, db, None, PAGE))
        assert listed["total"] == counts[category], category
    light_rows = body(await usage.engagement_list("light", db, None, PAGE, q="Light Co"))["items"]
    assert [r["id"] for r in light_rows] == [str(light.id)] and light_rows[0]["orders"] == 3 and light_rows[0]["users"] == 1
    with pytest.raises(NotFoundError):
        await usage.engagement_list("bogus", db, None, PAGE)


@pytest.mark.db
async def test_module_usage_matches_feature_adoption(db):
    await make_tenant(db, "Seller", orders=2)
    await make_tenant(db, "Idle", orders=0)
    adoption = {m["key"]: m for m in json.loads((await routes.admin_feature_usage(db, None)).body)["data"]["modules"]}
    data = body(await usage.module_usage("sales", db, None, PAGE, period="all"))
    assert data["total"] == adoption["sales"]["tenants_using"] == data["summary"]["kpis"]["tenants_using"]
    assert data["summary"]["kpis"]["total_records"] == adoption["sales"]["total_records"]
    assert sum(data["summary"]["engagement_mix"].values()) == data["total"]
    assert data["summary"]["trend"][-1]["tenants_using"] == data["total"]
    assert all(row["records"] > 0 for row in data["items"])
    zero = body(await usage.module_usage("repairs", db, None, PAGE, period="all", q="Seller"))
    assert zero["total"] == 0 and zero["items"] == []
    with pytest.raises(NotFoundError):
        await usage.module_usage("nope", db, None, PAGE)


@pytest.mark.db
async def test_currency_sales_counts_completed_orders_only_and_never_mixes_currencies(db):
    a = await make_tenant(db, "A", currency="XTS", orders=3, cancelled=2, amount=100)
    await make_tenant(db, "B", currency="XTS", orders=1, amount=50)
    await make_tenant(db, "Other currency", currency="XTT", orders=5, amount=1000)
    data = body(await usage.currency_sales("xts", db, None, PAGE, period="all"))
    kpis = data["summary"]["kpis"]
    assert kpis["total_sales"] == 350 and kpis["transactions"] == 4 and kpis["selling_tenants"] == 2 and kpis["average_order_value"] == 87.5
    assert [r["id"] for r in data["items"]][0] == str(a.id) and data["items"][0]["sales"] == 300
    assert sum(r["sales"] for r in data["items"]) == kpis["total_sales"]
    assert sum(point["sales"] for point in data["summary"]["trend"]) == kpis["total_sales"]
    recent = body(await usage.currency_sales("XTS", db, None, PAGE, period="30"))
    assert recent["summary"]["kpis"]["total_sales"] == 350 and recent["summary"]["grouping"] == "day"
    with pytest.raises(ValidationError):
        await usage.currency_sales("US", db, None, PAGE)
    with pytest.raises(NotFoundError):
        await usage.currency_sales("QQQ", db, None, PAGE)


@pytest.mark.db
async def test_tenant_usage_separates_entitlement_from_actual_use(db):
    tenant = await make_tenant(db, "Mixed", orders=2)
    data = json.loads((await usage.tenant_usage(tenant.id, db, None)).body)["data"]
    modules = {m["key"]: m for m in data["modules"]}
    assert modules["sales"]["used"] and modules["sales"]["records"] == 2
    assert not modules["hr"]["used"] and modules["hr"]["records"] == 0 and modules["hr"]["last_activity"] is None
    assert data["tier"] == "light" and data["users"] == 1
    with pytest.raises(NotFoundError):
        await usage.tenant_usage(uuid.uuid4(), db, None)
