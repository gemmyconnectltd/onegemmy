"""The shared date-period filter: inclusive days in the business's own timezone, on date and timestamp columns."""
import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select

from app.core.period import DatePeriod
from app.modules.inventory.models.batch import InventoryBatch
from app.modules.inventory.models.product import Product
from app.modules.inventory.service.product import count_products, list_products
from app.modules.tenants.models import Tenant

pytestmark = pytest.mark.db


async def shop(db):
    tenant = Tenant(name="Shop", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    made = {}
    for name, when in {"old": datetime(2026, 1, 10, 12, tzinfo=UTC), "march": datetime(2026, 3, 15, 12, tzinfo=UTC),
                       "late": datetime(2026, 3, 31, 22, 30, tzinfo=UTC)}.items():
        made[name] = Product(tenant_id=tenant.id, name=name, stock=1, cost=1, created_at=when)
        db.add(made[name])
    await db.flush()
    return tenant


async def names(db, tenant, **period):
    got = await list_products(db, tenant.id, 0, 50, None, None, DatePeriod(**period))
    assert len(got) == await count_products(db, tenant.id, None, None, DatePeriod(**period))
    return sorted(p.name for p in got)


async def test_period_keeps_only_rows_inside_it_and_no_period_keeps_everything(db):
    t = await shop(db)
    assert await names(db, t) == ["late", "march", "old"]
    assert await names(db, t, from_date=date(2026, 3, 1), to_date=date(2026, 3, 31)) == ["late", "march"]
    assert await names(db, t, from_date=date(2026, 3, 16)) == ["late"]
    assert await names(db, t, to_date=date(2026, 2, 1)) == ["old"]


async def test_a_day_is_the_businesss_day_not_the_utc_day(db):
    t = await shop(db)
    # 22:30 UTC on 31 March is already 1 April in Kigali (UTC+2).
    assert await names(db, t, from_date=date(2026, 4, 1), to_date=date(2026, 4, 1), timezone="Africa/Kigali") == ["late"]
    assert await names(db, t, from_date=date(2026, 4, 1), to_date=date(2026, 4, 1), timezone="UTC") == []


def test_date_columns_compare_by_day():
    sql = str(DatePeriod(from_date=date(2026, 1, 1), to_date=date(2026, 1, 31)).apply(select(InventoryBatch), InventoryBatch.manufactured_date))
    assert "manufactured_date >=" in sql and "manufactured_date <=" in sql
