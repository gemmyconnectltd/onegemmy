"""Super-admin business filters: industry, size, country, plan and feature use narrow the same group everywhere."""
import uuid
from datetime import UTC, datetime

import pytest

from app.modules.admin.routes import admin_feature_usage
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository

pytestmark = pytest.mark.db


async def make(db, tag, **fields):
    t = Tenant(name=f"{tag} {uuid.uuid4().hex[:6]}", slug=uuid.uuid4().hex, **fields)
    db.add(t)
    await db.flush()
    return t


async def test_filters_and_options_and_feature_use(db):
    tag = uuid.uuid4().hex[:6]
    shop = await make(db, "Shop", industry=f"Retail-{tag}", employee_count="2-5", country=f"Rwanda-{tag}", business_type="sole")
    mill = await make(db, "Mill", industry=f"Manufacturing-{tag}", employee_count="26-50", country=f"Kenya-{tag}", business_type="llc")
    db.add(Order(tenant_id=shop.id, order_number="A1", status="Completed", subtotal=1, total=1, ordered_at=datetime.now(UTC)))
    await db.flush()
    repo = TenantRepository(db)

    async def names(**filters):
        rows, total = await repo.admin_page(0, 50, filters)
        assert total == len(rows)
        return {r.name for r in rows}

    assert shop.name in await names(industry=f"Retail-{tag}") and mill.name not in await names(industry=f"Retail-{tag}")
    assert await names(country=f"Kenya-{tag}", size="26-50") == {mill.name}
    assert await names(country=f"Kenya-{tag}", size="2-5") == set()  # filters narrow together
    assert await names(country=f"Rwanda-{tag}", feature="sales", featureState="using") == {shop.name}
    assert await names(country=f"Kenya-{tag}", feature="sales", featureState="not_using") == {mill.name}

    options = await repo.filter_options()
    assert {"value": f"Retail-{tag}", "count": 1} in options["industries"] and {"value": "2-5", "count": options["sizes"][[s["value"] for s in options["sizes"]].index("2-5")]["count"]} in options["sizes"]
    labels = [s["value"] for s in options["sizes"]]
    assert labels.index("2-5") < labels.index("26-50")  # smallest first

    everyone = (await admin_feature_usage(db, None))
    narrowed = await admin_feature_usage(db, None, country=f"Rwanda-{tag}")
    body = narrowed.body.decode() if hasattr(narrowed, "body") else None
    assert body is not None and '"total_tenants":1' in body.replace(" ", "")
    assert everyone is not None


async def test_market_summary_describes_the_filtered_group(db):
    from app.modules.admin.routes import admin_tenant_summary
    tag = uuid.uuid4().hex[:6]
    a = await make(db, "A", industry=f"Retail-{tag}", employee_count="2-5", country=f"Rwanda-{tag}", subscription_plan="free")
    await make(db, "B", industry=f"Retail-{tag}", employee_count="6-10", country=f"Rwanda-{tag}", subscription_plan="starter")
    await make(db, "C", industry=f"Services-{tag}", employee_count="2-5", country=f"Rwanda-{tag}", subscription_plan="free")
    db.add(Order(tenant_id=a.id, order_number="S1", status="Completed", subtotal=1, total=1, ordered_at=datetime.now(UTC)))
    await db.flush()
    import json
    body = json.loads((await admin_tenant_summary(db, None, country=f"Rwanda-{tag}")).body)["data"]
    assert body["total"] == 3 and body["new_30_days"] == 3
    assert body["top_industry"] == {"name": f"Retail-{tag}", "count": 2, "percent": 67}
    assert body["top_size"]["name"] == "2-5" and body["paying"] == {"count": 1, "percent": 33} and body["recording_sales"]["count"] == 1
    narrowed = json.loads((await admin_tenant_summary(db, None, country=f"Rwanda-{tag}", industry=f"Services-{tag}")).body)["data"]
    assert narrowed["total"] == 1 and narrowed["top_industry"]["percent"] == 100
