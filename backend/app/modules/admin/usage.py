"""Platform Usage drill-downs for Super Admin: module adoption, currency sales and engagement lists.

Everything here is a grouped aggregate (never a query per tenant) and reuses the definitions behind /admin/usage-breakdown
and /admin/feature-usage so the overview and the detail pages reconcile:
  - engagement tier = the tenant's all-time order count: dormant 0, light 1-9, moderate 10-49, heavy 50+
  - module adoption = tenants with at least one record in that module's own table (not "feature enabled")
  - sales = completed orders, summed from base_total (the tenant's own currency), grouped by the tenant's currency
"""
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import Date, case, cast, func, or_, select

from app.core.deps import DbSession, SuperUser
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.accounting.models.transaction import Transaction
from app.modules.audit.models import AuditLog
from app.modules.hr.models.employee import Employee
from app.modules.inventory.models.product import Product
from app.modules.manufacturing.models.production_order import ProductionOrder
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.repairs.models.job import RepairJob
from app.modules.sales.models.deal import Deal
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant, User

router = APIRouter(prefix="/admin/usage", tags=["Super Admin"])

# key, label, table-owning model, description
FEATURE_MODULES = [
    ("sales", "Sales", Order, "Orders and point-of-sale activity."),
    ("inventory", "Inventory", Product, "Products and stock records."),
    ("accounting", "Accounting", Transaction, "Journal transactions."),
    ("hr", "HR", Employee, "Employee records."),
    ("procurement", "Purchases", PurchaseOrder, "Purchase orders."),
    ("manufacturing", "Manufacturing", ProductionOrder, "Production orders."),
    ("crm", "CRM", Deal, "Deals and customer relationships."),
    ("repairs", "Repairs", RepairJob, "Repair jobs."),
]
MODULES = {key: (label, model, description) for key, label, model, description in FEATURE_MODULES}

TIERS = ("dormant", "light", "moderate", "heavy")
TIER_DEFINITIONS = {
    "dormant": "No orders recorded, ever.",
    "light": "1 to 9 orders recorded in total.",
    "moderate": "10 to 49 orders recorded in total.",
    "heavy": "50 or more orders recorded in total.",
}
Period = Literal["30", "90", "365", "all"]


def tier_case(count_col):
    """The single definition of an engagement tier from an all-time order count."""
    return case((func.coalesce(count_col, 0) == 0, "dormant"), (func.coalesce(count_col, 0) < 10, "light"),
                (func.coalesce(count_col, 0) < 50, "moderate"), else_="heavy")


def tenant_status(is_active, subscription_status):
    return case((is_active.is_(True), "active"), (subscription_status == "pending", "pending"), else_="suspended")


def since(period: str) -> datetime | None:
    return None if period == "all" else datetime.now(UTC) - timedelta(days=int(period))


def order_counts():
    return select(Order.tenant_id, func.count().label("cnt"), func.max(Order.ordered_at).label("last")).group_by(Order.tenant_id).subquery()


def tenant_row(r) -> dict:
    return {"id": str(r.id), "name": r.name.strip(), "slug": r.slug, "plan": r.subscription_plan, "status": r.status,
            "subscription_status": r.subscription_status, "users": r.users, "currency": r.currency}


def user_counts():
    return select(User.tenant_id, func.count().label("users")).group_by(User.tenant_id).subquery()


# ── Engagement ────────────────────────────────────────────────────────────────

@router.get("/engagement/{category}")
async def engagement_list(category: str, db: DbSession, _: SuperUser, page: PageQuery, q: str | None = None,
                          status: Literal["all", "active", "pending", "suspended"] = "all",
                          sort: Literal["orders", "name", "last_activity", "users"] = "orders",
                          direction: Literal["asc", "desc"] = Query("desc", alias="dir")):
    if category not in TIERS:
        raise NotFoundError("Unknown engagement category")
    orders, users = order_counts(), user_counts()
    tier = tier_case(orders.c.cnt)
    status_expr = tenant_status(Tenant.is_active, Tenant.subscription_status)
    base = select(Tenant.id, Tenant.name, Tenant.slug, Tenant.subscription_plan, Tenant.subscription_status, Tenant.currency,
                  status_expr.label("status"), func.coalesce(users.c.users, 0).label("users"),
                  func.coalesce(orders.c.cnt, 0).label("orders"), orders.c.last.label("last_activity")
                  ).select_from(Tenant).outerjoin(orders, orders.c.tenant_id == Tenant.id).outerjoin(users, users.c.tenant_id == Tenant.id
                                                                                                        ).where(tier == category)
    if q:
        term = f"%{q.strip().replace('%', '').replace('_', '')}%"
        base = base.where(or_(Tenant.name.ilike(term), Tenant.slug.ilike(term)))
    if status != "all":
        base = base.where(status_expr == status)
    sub = base.subquery()
    total = (await db.execute(select(func.count()).select_from(sub))).scalar_one()
    column = {"orders": sub.c.orders, "name": func.lower(sub.c.name), "last_activity": sub.c.last_activity, "users": sub.c.users}[sort]
    ordering = column.desc().nulls_last() if direction == "desc" else column.asc().nulls_last()
    rows = (await db.execute(select(sub).order_by(ordering, sub.c.id).offset(page.offset).limit(min(page.page_size, 100)))).all()
    items = [{**tenant_row(r), "orders": r.orders, "last_activity": r.last_activity.isoformat() if r.last_activity else None, "category": category}
             for r in rows]
    return paginated_response(items=items, total=total, page=page.page, page_size=page.page_size, message="Engagement list retrieved",
                              summary={"category": category, "definition": TIER_DEFINITIONS[category]})


# ── Module usage ──────────────────────────────────────────────────────────────

@router.get("/modules/{key}")
async def module_usage(key: str, db: DbSession, _: SuperUser, page: PageQuery, period: Period = "30", q: str | None = None,
                       status: Literal["all", "active", "pending", "suspended"] = "all"):
    if key not in MODULES:
        raise NotFoundError("Unknown module")
    label, model, description = MODULES[key]
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()
    start = since(period)
    totals = (await db.execute(select(func.count(func.distinct(model.tenant_id)), func.count()).select_from(model))).one()
    active = (await db.execute(select(func.count(func.distinct(model.tenant_id))).where(*([model.created_at >= start] if start else [])))).scalar_one()
    period_records = (await db.execute(select(func.count()).select_from(model).where(*([model.created_at >= start] if start else [])))).scalar_one()

    # Adoption over time: how many tenants had created their first record by the end of each month (real history).
    first = select(model.tenant_id, func.min(model.created_at).label("first")).group_by(model.tenant_id).subquery()
    month = cast(func.date_trunc("month", first.c.first), Date)
    trend_rows = (await db.execute(select(month.label("month"), func.count().label("new")).group_by(month).order_by(month))).all()
    running, trend = 0, []
    for r in trend_rows:
        running += r.new
        trend.append({"month": r.month.isoformat(), "new_adopters": r.new, "tenants_using": running})

    orders, users = order_counts(), user_counts()
    tier = tier_case(orders.c.cnt)
    records = select(model.tenant_id, func.count().label("records"), func.max(model.created_at).label("last")).group_by(model.tenant_id).subquery()
    status_expr = tenant_status(Tenant.is_active, Tenant.subscription_status)
    base = select(Tenant.id, Tenant.name, Tenant.slug, Tenant.subscription_plan, Tenant.subscription_status, Tenant.currency,
                  status_expr.label("status"), func.coalesce(users.c.users, 0).label("users"), records.c.records, records.c.last.label("last_activity"),
                  tier.label("tier")).select_from(Tenant).join(records, records.c.tenant_id == Tenant.id
                                                              ).outerjoin(users, users.c.tenant_id == Tenant.id).outerjoin(orders, orders.c.tenant_id == Tenant.id)
    if q:
        term = f"%{q.strip().replace('%', '').replace('_', '')}%"
        base = base.where(or_(Tenant.name.ilike(term), Tenant.slug.ilike(term)))
    if status != "all":
        base = base.where(status_expr == status)
    sub = base.subquery()
    total = (await db.execute(select(func.count()).select_from(sub))).scalar_one()
    mix_rows = (await db.execute(select(sub.c.tier, func.count()).group_by(sub.c.tier))).all() if not q and status == "all" else None
    rows = (await db.execute(select(sub).order_by(sub.c.records.desc(), sub.c.id).offset(page.offset).limit(min(page.page_size, 100)))).all()
    items = [{**tenant_row(r), "records": r.records, "tier": r.tier, "last_activity": r.last_activity.isoformat() if r.last_activity else None} for r in rows]
    mix = {t: 0 for t in TIERS}
    for tier_name, count in mix_rows or []:
        mix[tier_name] = count
    return paginated_response(items=items, total=total, page=page.page, page_size=page.page_size, message="Module usage retrieved", summary={
        "module": {"key": key, "label": label, "description": description},
        "period": period,
        "kpis": {"total_tenants": total_tenants, "tenants_using": totals[0], "adoption_pct": round(totals[0] / total_tenants * 100) if total_tenants else 0,
                 "total_records": totals[1], "active_tenants_in_period": active, "records_in_period": period_records},
        "engagement_mix": mix if mix_rows is not None else None,
        "trend": trend,
    })


# ── Currency sales ────────────────────────────────────────────────────────────

@router.get("/sales/{currency}")
async def currency_sales(currency: str, db: DbSession, _: SuperUser, page: PageQuery, period: Period = "all", q: str | None = None):
    code = currency.upper()
    if len(code) != 3 or not code.isalpha():
        raise ValidationError("Invalid currency code")
    start = since(period)
    amount = func.coalesce(Order.base_total, Order.total)
    conditions = [Order.status == "Completed", Tenant.currency == code, *([Order.ordered_at >= start] if start else [])]
    totals = (await db.execute(select(func.coalesce(func.sum(amount), 0), func.count(), func.count(func.distinct(Order.tenant_id)))
                               .join(Tenant, Tenant.id == Order.tenant_id).where(*conditions))).one()
    sales, count, tenants = float(totals[0]), totals[1], totals[2]
    if count == 0 and not (await db.execute(select(Tenant.id).where(Tenant.currency == code).limit(1))).first():
        raise NotFoundError("No tenant uses this currency")
    # Daily buckets for up to 90 days, monthly otherwise.
    unit = "day" if period in ("30", "90") else "month"
    bucket = cast(func.date_trunc(unit, func.timezone("UTC", Order.ordered_at)), Date)
    trend_rows = (await db.execute(select(bucket.label("b"), func.coalesce(func.sum(amount), 0), func.count())
                                   .join(Tenant, Tenant.id == Order.tenant_id).where(*conditions).group_by(bucket).order_by(bucket))).all()
    per_tenant = select(Tenant.id, Tenant.name, Tenant.slug, Tenant.subscription_plan, Tenant.subscription_status, Tenant.currency,
                        tenant_status(Tenant.is_active, Tenant.subscription_status).label("status"),
                        func.coalesce(func.sum(amount), 0).label("sales"), func.count().label("orders")
                        ).select_from(Order).join(Tenant, Tenant.id == Order.tenant_id).where(*conditions).group_by(Tenant.id)
    if q:
        term = f"%{q.strip().replace('%', '').replace('_', '')}%"
        per_tenant = per_tenant.where(or_(Tenant.name.ilike(term), Tenant.slug.ilike(term)))
    sub = per_tenant.subquery()
    total = (await db.execute(select(func.count()).select_from(sub))).scalar_one()
    rows = (await db.execute(select(sub).order_by(sub.c.sales.desc(), sub.c.id).offset(page.offset).limit(min(page.page_size, 100)))).all()
    items = [{"id": str(r.id), "name": r.name.strip(), "slug": r.slug, "plan": r.subscription_plan, "status": r.status, "currency": code,
              "sales": float(r.sales), "orders": r.orders} for r in rows]
    return paginated_response(items=items, total=total, page=page.page, page_size=page.page_size, message="Currency sales retrieved", summary={
        "currency": code, "period": period, "grouping": unit,
        "kpis": {"total_sales": sales, "transactions": count, "average_order_value": round(sales / count, 2) if count else 0, "selling_tenants": tenants},
        "trend": [{"date": r[0].isoformat(), "sales": float(r[1]), "orders": r[2]} for r in trend_rows],
    })


# ── One tenant ────────────────────────────────────────────────────────────────

@router.get("/tenants/{tenant_id}")
async def tenant_usage(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Business not found")
    from app.modules.tenants.service.feature import get_effective_features
    features = await get_effective_features(db, tenant_id)
    modules = []
    for key, label, model, _description in FEATURE_MODULES:
        row = (await db.execute(select(func.count(), func.max(model.created_at)).where(model.tenant_id == tenant_id))).one()
        modules.append({"key": key, "label": label, "enabled": features.get(key), "used": row[0] > 0, "records": row[0],
                        "last_activity": row[1].isoformat() if row[1] else None})
    orders = (await db.execute(select(func.count()).where(Order.tenant_id == tenant_id))).scalar_one()
    users = (await db.execute(select(func.count()).where(User.tenant_id == tenant_id))).scalar_one()
    events = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at.desc()).limit(15))).scalars().all()
    tier = "dormant" if orders == 0 else "light" if orders < 10 else "moderate" if orders < 50 else "heavy"
    return success_response(data={
        "tier": tier, "tier_definition": TIER_DEFINITIONS[tier], "orders": orders, "users": users, "modules": modules,
        "recent_activity": [{"id": str(e.id), "action": e.action, "summary": e.summary, "actor": e.actor_name,
                             "created_at": e.created_at.isoformat() if e.created_at else None} for e in events],
    }, message="Tenant usage retrieved")
