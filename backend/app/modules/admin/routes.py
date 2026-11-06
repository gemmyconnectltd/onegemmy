import secrets
import uuid
from datetime import date, timedelta
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import case, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DbSession, SuperUser
from app.core.email import send_invite_email
from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.core.security import hash_password, validate_password_strength
from app.modules.admin.analytics import (
    all_time_sales_by_plan,
    all_time_sales_converted,
    invalidate_analytics_cache,
)
from app.modules.admin.export import build_users_export, resolve_columns
from app.modules.admin.repository import tenant_plan_labels
from app.modules.admin.tenant_records import TenantRecordSection, list_tenant_records
from app.modules.admin.usage import FEATURE_MODULES, tier_case
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
from app.modules.sales.models.order import Order
from app.modules.tenants import service
from app.modules.tenants.models import Branch, Tenant, User
from app.modules.tenants.repository import TenantRepository, UserRepository
from app.modules.tenants.schemas import (
    BranchCreate,
    DepartmentCreate,
    FeatureOverrideUpdate,
    RoleCreate,
    TenantCreate,
    TenantLimitsUpdate,
    TenantUpdate,
    UserCreate,
    UserUpdate,
)
from app.shared.schemas import TrimmedModel

log = get_logger("admin.routes")

router = APIRouter(prefix="/admin", tags=["Super Admin"])


def _empty_usage() -> dict:
    return {"users": 0, "orders": 0, "completed_orders": 0, "revenue": 0.0, "products": 0, "last_active_at": None}


async def _tenant_usage_map(db: AsyncSession, tenant_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Per-tenant usage (users, orders, revenue, products, last activity) for
    every tenant in `tenant_ids`, in four grouped queries total — never one
    query per tenant, so this stays cheap at any page size."""
    if not tenant_ids:
        return {}
    usage: dict[uuid.UUID, dict] = {tid: _empty_usage() for tid in tenant_ids}

    user_rows = (await db.execute(
        select(User.tenant_id, func.count().label("cnt"))
        .where(User.tenant_id.in_(tenant_ids))
        .group_by(User.tenant_id)
    )).fetchall()
    for r in user_rows:
        usage[r.tenant_id]["users"] = r.cnt

    order_rows = (await db.execute(
        select(
            Order.tenant_id,
            func.count().label("cnt"),
            func.sum(case((Order.status == "Completed", 1), else_=0)).label("completed"),
            func.max(Order.ordered_at).label("last_order_at"),
        )
        .where(Order.tenant_id.in_(tenant_ids))
        .group_by(Order.tenant_id)
    )).fetchall()
    for r in order_rows:
        usage[r.tenant_id]["orders"] = r.cnt
        usage[r.tenant_id]["completed_orders"] = int(r.completed or 0)
        usage[r.tenant_id]["last_active_at"] = r.last_order_at.isoformat() if r.last_order_at else None

    product_rows = (await db.execute(
        select(Product.tenant_id, func.count().label("cnt"))
        .where(Product.tenant_id.in_(tenant_ids))
        .group_by(Product.tenant_id)
    )).fetchall()
    for r in product_rows:
        usage[r.tenant_id]["products"] = r.cnt

    revenue_rows = (await db.execute(
        select(Order.tenant_id, func.sum(func.coalesce(Order.base_total, Order.total)).label("revenue"))
        .where(Order.tenant_id.in_(tenant_ids), Order.status == "Completed")
        .group_by(Order.tenant_id)
    )).all()
    for r in revenue_rows:
        usage[r.tenant_id]["revenue"] = float(r.revenue or 0)

    return usage


# ── Platform stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(db: DbSession, _: SuperUser):
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()
    active_tenants = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_active == True))).scalar_one()
    total_users = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id.isnot(None)))).scalar_one()
    total_orders = (await db.execute(select(func.count()).select_from(Order))).scalar_one()
    completed_orders = (await db.execute(select(func.count()).select_from(Order).where(Order.status == "Completed"))).scalar_one()
    # Tenant sales volume (GMV), converted to the platform reporting currency — summing raw ledger
    # amounts across tenants would add RWF to KES to USD. Not PESAA's own revenue.
    sales = await all_time_sales_converted()
    total_revenue = sales["total"]
    total_products = (await db.execute(select(func.count()).select_from(Product))).scalar_one()

    # Per-plan breakdown
    plan_rows = (await db.execute(
        select(Tenant.subscription_plan, func.count().label("cnt"))
        .group_by(Tenant.subscription_plan)
    )).fetchall()
    plans = {row.subscription_plan: row.cnt for row in plan_rows}

    # Monthly new tenants (last 6 months)
    monthly = (await db.execute(text("""
        SELECT TO_CHAR(created_at, 'Mon') AS month,
               DATE_TRUNC('month', created_at) AS month_start,
               COUNT(*) AS cnt
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY month, month_start
        ORDER BY month_start
    """))).fetchall()

    return success_response(data={
        "archived_tenants": (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.archived_at.is_not(None)))).scalar_one(),
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "suspended_tenants": total_tenants - active_tenants,
        "trial_tenants": (await db.execute(select(func.count()).select_from(Tenant).where(
            Tenant.subscription_status.in_(["trial", "trialing"])
        ))).scalar_one(),
        "cancelled_tenants": (await db.execute(select(func.count()).select_from(Tenant).where(
            Tenant.subscription_status.in_(["cancelled", "canceled"])
        ))).scalar_one(),
        "total_users": total_users,
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "total_revenue": float(total_revenue),
        "revenue_by_currency": sales["by_currency"],
        "reporting_currency": sales["reporting_currency"],
        "total_products": total_products,
        "plans": plans,
        "plan_names": await tenant_plan_labels(db),
        "monthly_signups": [{"month": r.month, "count": r.cnt} for r in monthly],
    }, message="Platform stats retrieved")


# The module catalogue lives in usage.py so the overview and the drill-down pages share it.
_FEATURE_MODULES = [(key, label, model) for key, label, model, _ in FEATURE_MODULES]


@router.get("/feature-usage")
async def admin_feature_usage(db: DbSession, _: SuperUser, q: str | None = None, status: Literal["all", "active", "pending", "suspended", "trial", "cancelled"] = "all",
                              plan: str | None = None, country: str | None = None, industry: str | None = None, businessType: str | None = None,
                              heardAbout: str | None = None, size: str | None = None, created_from: date | None = None, created_to: date | None = None):
    """How much each core module is actually being used, for all businesses or for the group the filters select:
    adoption (businesses with at least one record) and volume (total records)."""
    conditions = TenantRepository.admin_conditions({"q": q, "status": status, "plan": plan, "country": country, "industry": industry, "businessType": businessType,
                                                    "heardAbout": heardAbout, "size": size, "from": created_from.isoformat() if created_from else None,
                                                    "to": created_to.isoformat() if created_to else None})
    segment = select(Tenant.id).where(*conditions)
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant).where(*conditions))).scalar_one()

    modules = []
    for key, label, model in _FEATURE_MODULES:
        row = (await db.execute(
            select(
                func.count(func.distinct(model.tenant_id)).label("tenants_using"),
                func.count().label("total_records"),
            ).select_from(model).where(model.tenant_id.in_(segment))
        )).one()
        modules.append({
            "key": key,
            "label": label,
            "tenants_using": row.tenants_using,
            "total_records": row.total_records,
            "adoption_pct": round((row.tenants_using / total_tenants) * 100) if total_tenants else 0,
        })
    modules.sort(key=lambda m: m["total_records"], reverse=True)

    return success_response(
        data={"total_tenants": total_tenants, "modules": modules},
        message="Feature usage retrieved",
    )


@router.get("/tenant-analytics")
async def admin_tenant_analytics(db: DbSession, _: SuperUser):
    """Breakdown charts: country, industry, business_type, heard_about, status, plan, monthly signups."""

    async def group_by_col(col):
        expr = func.coalesce(func.nullif(func.btrim(col), ""), "Not specified")
        rows = (await db.execute(
            select(expr.label("name"), func.count().label("cnt"))
            .group_by(expr).order_by(func.count().desc())
        )).fetchall()
        return [{"name": r.name, "value": r.cnt} for r in rows]

    active = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_active == True))).scalar_one()
    pending = (await db.execute(select(func.count()).select_from(Tenant).where(
        Tenant.is_active == False, Tenant.subscription_status == "pending"
    ))).scalar_one()
    suspended = (await db.execute(select(func.count()).select_from(Tenant).where(
        Tenant.is_active == False, Tenant.subscription_status != "pending"
    ))).scalar_one()

    plan_rows = (await db.execute(
        select(Tenant.subscription_plan, func.count().label("cnt"))
        .group_by(Tenant.subscription_plan).order_by(func.count().desc())
    )).fetchall()

    monthly = (await db.execute(text("""
        SELECT TO_CHAR(created_at, 'Mon YY') AS month,
               DATE_TRUNC('month', created_at) AS month_start,
               COUNT(*) AS cnt
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY month, month_start
        ORDER BY month_start
    """))).fetchall()

    # Every country with at least one user (not just the top few): users and businesses per country.
    country_expr = func.coalesce(func.nullif(Tenant.country, ""), "Unknown")
    country_rows = (await db.execute(
        select(country_expr.label("name"), func.count(func.distinct(User.id)).label("users"), func.count(func.distinct(Tenant.id)).label("businesses"))
        .select_from(User).join(Tenant, Tenant.id == User.tenant_id)
        .group_by(country_expr).order_by(func.count(func.distinct(User.id)).desc(), country_expr)
    )).fetchall()

    return success_response(data={
        "users_by_country": [{"name": r.name, "users": r.users, "businesses": r.businesses} for r in country_rows],
        "by_country":       await group_by_col(Tenant.country),
        "by_industry":      await group_by_col(Tenant.industry),
        "by_business_type": await group_by_col(Tenant.business_type),
        "by_heard_about":   await group_by_col(Tenant.heard_about),
        "by_status": [
            {"name": "Active",    "value": active},
            {"name": "Pending",   "value": pending},
            {"name": "Suspended", "value": suspended},
        ],
        "by_plan": [{"name": r.subscription_plan, "value": r.cnt} for r in plan_rows],
        "monthly_signups": [{"month": r.month, "count": r.cnt} for r in monthly],
    }, message="Tenant analytics retrieved")


@router.get("/usage-breakdown")
async def admin_usage_breakdown(db: DbSession, _: SuperUser):
    """Deep-dive into how tenants actually use the platform: engagement tiers
    (by order volume), per-plan usage (users, orders, revenue, products) and
    the top tenants by order count. All aggregate queries — one grouped query
    per metric, never one per tenant — matching the /stats and /feature-usage
    approach so it stays cheap regardless of tenant count."""
    # Engagement tiers — bucket every tenant by order volume.
    order_counts = (
        select(Order.tenant_id, func.count().label("cnt"))
        .group_by(Order.tenant_id)
        .subquery()
    )
    tier = tier_case(order_counts.c.cnt)
    tier_rows = (await db.execute(
        select(tier.label("tier"), func.count().label("tenants"))
        .select_from(Tenant)
        .outerjoin(order_counts, order_counts.c.tenant_id == Tenant.id)
        .group_by(tier)
    )).fetchall()
    engagement = {r.tier: r.tenants for r in tier_rows}
    total_tenants = sum(engagement.values())
    engaged_tenants = total_tenants - engagement.get("dormant", 0)

    active_30d = (await db.execute(
        select(func.count(func.distinct(Order.tenant_id)))
        .where(Order.ordered_at >= func.now() - text("INTERVAL '30 days'"))
    )).scalar_one()

    # Per-plan usage — one grouped query per metric, inner-joined to the plan.
    plan_tenants = {
        r.subscription_plan: r.cnt for r in (await db.execute(
            select(Tenant.subscription_plan, func.count().label("cnt"))
            .group_by(Tenant.subscription_plan)
        )).fetchall()
    }
    plan_users = {
        r.subscription_plan: r.cnt for r in (await db.execute(
            select(Tenant.subscription_plan, func.count().label("cnt"))
            .select_from(User)
            .join(Tenant, Tenant.id == User.tenant_id)
            .group_by(Tenant.subscription_plan)
        )).fetchall()
    }
    plan_orders = {
        r.subscription_plan: {"orders": r.cnt, "completed_orders": int(r.completed or 0)}
        for r in (await db.execute(
            select(
                Tenant.subscription_plan,
                func.count().label("cnt"),
                func.sum(case((Order.status == "Completed", 1), else_=0)).label("completed"),
            )
            .select_from(Order)
            .join(Tenant, Tenant.id == Order.tenant_id)
            .group_by(Tenant.subscription_plan)
        )).fetchall()
    }
    plan_products = {
        r.subscription_plan: r.cnt for r in (await db.execute(
            select(Tenant.subscription_plan, func.count().label("cnt"))
            .select_from(Product)
            .join(Tenant, Tenant.id == Product.tenant_id)
            .group_by(Tenant.subscription_plan)
        )).fetchall()
    }
    # Per-plan tenant sales, converted to the reporting currency (a plan holds tenants in several
    # currencies, so a raw sum would be meaningless).
    plan_sales = await all_time_sales_by_plan()
    plan_revenue = plan_sales["by_plan"]

    plan_keys = set(plan_tenants) | set(plan_users) | set(plan_orders) | set(plan_products) | set(plan_revenue)
    plan_names = await tenant_plan_labels(db)
    by_plan = [
        {
            "plan": p,
            "plan_name": plan_names.get(p, p),
            "tenants": plan_tenants.get(p, 0),
            "users": plan_users.get(p, 0),
            "orders": (plan_orders.get(p) or {}).get("orders", 0),
            "completed_orders": (plan_orders.get(p) or {}).get("completed_orders", 0),
            "revenue": plan_revenue.get(p, 0.0),
            "revenue_by_currency": plan_sales["original_by_plan"].get(p, {}),
            "products": plan_products.get(p, 0),
        }
        for p in plan_keys
    ]
    by_plan.sort(key=lambda r: r["tenants"], reverse=True)

    # Top tenants by order volume (bounded — response never grows with scale).
    top_ids = [
        r.tenant_id for r in (await db.execute(
            select(Order.tenant_id, func.count().label("cnt"))
            .group_by(Order.tenant_id)
            .order_by(func.count().desc())
            .limit(10)
        )).fetchall()
    ]
    top_usage = await _tenant_usage_map(db, top_ids)
    top_tenant_rows = {} if not top_ids else {
        t.id: t for t in (await db.execute(select(Tenant).where(Tenant.id.in_(top_ids)))).scalars()
    }
    top_tenants = []
    for tid in top_ids:
        t = top_tenant_rows.get(tid)
        top_tenants.append({
            "id": str(tid),
            "name": t.name if t else str(tid)[:8],
            "slug": t.slug if t else "",
            "subscription_plan": t.subscription_plan if t else "free",
            "currency": t.currency if t else "RWF",
            "is_active": t.is_active if t else False,
            **top_usage.get(tid, _empty_usage()),
        })

    sales = await all_time_sales_converted()
    totals = {
        "total_orders": sum(r["orders"] for r in by_plan),
        "total_users": sum(r["users"] for r in by_plan),
        "total_products": sum(r["products"] for r in by_plan),
        "total_revenue": sales["total"],
        "revenue_by_currency": sales["by_currency"],
    }

    return success_response(data={
        "summary": {
            "total_tenants": total_tenants,
            "engaged_tenants": engaged_tenants,
            "dormant_tenants": engagement.get("dormant", 0),
            "active_30d": active_30d,
            "avg_users_per_tenant": round(totals["total_users"] / total_tenants, 1) if total_tenants else 0,
            "avg_orders_per_tenant": round(totals["total_orders"] / total_tenants, 1) if total_tenants else 0,
            **totals,
            "reporting_currency": plan_sales["reporting_currency"],
        },
        "engagement": [
            {"tier": t, "tenants": engagement.get(t, 0)}
            for t in ("dormant", "light", "moderate", "heavy")
        ],
        "by_plan": by_plan,
        "top_tenants": top_tenants,
    }, message="Platform usage breakdown retrieved")


# ── Platform users ────────────────────────────────────────────────────────────

def _build_admin_users_query(
    search: str | None = None,
    tenant_id: uuid.UUID | None = None,
    role: str | None = None,
    status: str | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
):
    """The one filtered query behind both the platform Users dashboard and
    the user export (see admin_list_all_users / admin_export_users below) —
    so export always matches exactly what the dashboard shows for the same
    filters, and the two can never drift into different result sets."""
    stmt = (
        select(User, Tenant.name, Branch.name)
        .outerjoin(Tenant, Tenant.id == User.tenant_id)
        .outerjoin(Branch, Branch.id == User.branch_id)
    )
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if tenant_id is not None:
        stmt = stmt.where(User.tenant_id == tenant_id)
    if role:
        stmt = stmt.where(User.role == role)
    if status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif status == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    if created_from is not None:
        stmt = stmt.where(User.created_at >= created_from)
    if created_to is not None:
        # created_to is a calendar date — include the whole day, not just midnight.
        stmt = stmt.where(User.created_at < created_to + timedelta(days=1))
    return stmt


def _admin_user_row(u: User, tenant_name: str | None, branch_name: str | None) -> dict:
    """Row shape shared by the dashboard list and every export format. Only
    ever reads these specific columns off `u` — hashed_password and friends
    are never touched, so they can't leak here even by future mistake."""
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "phone": u.phone,
        "role": u.role,
        "is_active": u.is_active,
        "is_superuser": u.is_superuser,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
        "tenant_id": str(u.tenant_id) if u.tenant_id else None,
        "tenant_name": tenant_name,
        "branch_id": str(u.branch_id) if u.branch_id else None,
        "branch_name": branch_name,
    }


@router.get("/users")
async def admin_list_all_users(
    db: DbSession, _: SuperUser, page_params: PageQuery,
    search: str | None = None,
    tenant_id: uuid.UUID | None = None,
    role: str | None = None,
    status: Literal["active", "inactive"] | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
):
    base = _build_admin_users_query(search, tenant_id, role, status, created_from, created_to)
    stmt = base.order_by(User.created_at.desc()).offset(page_params.offset).limit(page_params.limit)
    rows = (await db.execute(stmt)).all()
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = [_admin_user_row(u, tname, bname) for u, tname, bname in rows]
    return paginated_response(items=items, total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="All users retrieved")


class AdminUserExportRequest(BaseModel):
    scope: Literal["filtered", "all", "current_page", "selected"] = "filtered"
    format: Literal["xlsx", "csv"] = "xlsx"
    columns: list[str] | None = None
    search: str | None = None
    tenant_id: uuid.UUID | None = None
    role: str | None = None
    status: Literal["active", "inactive"] | None = None
    created_from: date | None = None
    created_to: date | None = None
    page: int = 1
    page_size: int = 50
    selected_ids: list[uuid.UUID] | None = None


@router.post("/users/export")
async def admin_export_users(data: AdminUserExportRequest, db: DbSession, admin: SuperUser):
    """Superadmin-only (enforced by the `SuperUser` dependency server-side,
    not just a hidden frontend button). Builds the export from exactly the
    same filtered query the dashboard list uses — see
    _build_admin_users_query — so "Filtered Results" always matches what's
    on screen, at any size, without paging through the frontend."""
    filters: dict = {}

    if data.scope == "selected":
        if not data.selected_ids:
            raise ValidationError("No users selected")
        stmt = (
            select(User, Tenant.name, Branch.name)
            .outerjoin(Tenant, Tenant.id == User.tenant_id)
            .outerjoin(Branch, Branch.id == User.branch_id)
            .where(User.id.in_(data.selected_ids))
            .order_by(User.created_at.desc())
        )
    elif data.scope == "all":
        stmt = _build_admin_users_query().order_by(User.created_at.desc())
    else:
        filters = {
            "search": data.search, "tenant_name": None, "role": data.role,
            "status": data.status, "created_from": data.created_from, "created_to": data.created_to,
        }
        if data.tenant_id is not None:
            tenant = await TenantRepository(db).get(data.tenant_id)
            filters["tenant_name"] = tenant.name if tenant else str(data.tenant_id)
        base = _build_admin_users_query(
            data.search, data.tenant_id, data.role, data.status, data.created_from, data.created_to,
        )
        stmt = base.order_by(User.created_at.desc())
        if data.scope == "current_page":
            stmt = stmt.offset((data.page - 1) * data.page_size).limit(data.page_size)

    rows = (await db.execute(stmt)).all()
    items = [_admin_user_row(u, tname, bname) for u, tname, bname in rows]
    columns = resolve_columns(data.columns)

    filename, content, media_type = build_users_export(
        items, columns, data.format, admin.full_name or admin.email, filters,
    )

    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="users.export", entity_type="user_export", entity_id=None,
        summary=f"Exported {len(items)} users as {data.format.upper()} ({data.scope})",
        changes={"scope": data.scope, "format": data.format, "count": len(items), "filters": filters},
    )
    await db.commit()

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


# ── Tenant CRUD ───────────────────────────────────────────────────────────────

@router.get("/tenants/summary")
async def admin_tenant_summary(db: DbSession, _: SuperUser, q: str | None = None, status: Literal["all", "active", "pending", "suspended", "trial", "cancelled"] = "all",
                               plan: str | None = None, country: str | None = None, industry: str | None = None, businessType: str | None = None,
                               heardAbout: str | None = None, size: str | None = None, feature: str | None = None,
                               featureState: Literal["using", "not_using"] | None = None, created_from: date | None = None, created_to: date | None = None):
    """Market-research figures for the businesses the filters select: how many, how fast they join, what they are like, and whether they use the product.
    Archived businesses never count (they are not part of the market)."""
    from datetime import UTC, datetime, timedelta

    conditions = TenantRepository.admin_conditions({
        "q": q, "status": status, "plan": plan, "country": country, "industry": industry, "businessType": businessType, "heardAbout": heardAbout,
        "size": size, "feature": feature, "featureState": featureState,
        "from": created_from.isoformat() if created_from else None, "to": created_to.isoformat() if created_to else None})
    conditions.append(Tenant.archived_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(Tenant).where(*conditions))).scalar_one()

    async def top(column) -> dict | None:
        row = (await db.execute(select(column, func.count()).where(*conditions, column.is_not(None), column != "").group_by(column).order_by(func.count().desc(), column).limit(1))).first()
        return {"name": row[0], "count": int(row[1]), "percent": round(row[1] / total * 100) if total else 0} if row else None

    async def count(*extra) -> int:
        return (await db.execute(select(func.count()).select_from(Tenant).where(*conditions, *extra))).scalar_one()

    now = datetime.now(UTC)
    new_30, previous_30 = await count(Tenant.created_at >= now - timedelta(days=30)), await count(Tenant.created_at >= now - timedelta(days=60), Tenant.created_at < now - timedelta(days=30))
    paying = await count(Tenant.subscription_plan != "free")
    selling = await count(Tenant.id.in_(select(Order.tenant_id).distinct()))
    return success_response(data={
        "total": total, "new_30_days": new_30, "previous_30_days": previous_30,
        "top_industry": await top(Tenant.industry), "top_country": await top(Tenant.country), "top_size": await top(Tenant.employee_count), "top_business_type": await top(Tenant.business_type),
        "paying": {"count": paying, "percent": round(paying / total * 100) if total else 0},
        "recording_sales": {"count": selling, "percent": round(selling / total * 100) if total else 0},
    }, message="Market summary retrieved")


@router.get("/tenants/filter-options")
async def admin_tenant_filter_options(db: DbSession, _: SuperUser):
    """Every value a business can be filtered by, with how many businesses have it."""
    return success_response(data=await TenantRepository(db).filter_options(), message="Filter options retrieved")


@router.get("/tenants")
async def admin_list_tenants(
    db: DbSession, _: SuperUser, page_params: PageQuery, q: str | None = None,
    status: Literal["all", "active", "pending", "suspended", "trial", "cancelled"] = "all",
    plan: str | None = None, country: str | None = None, industry: str | None = None,
    businessType: str | None = None, heardAbout: str | None = None, size: str | None = None,
    feature: str | None = None, featureState: Literal["using", "not_using"] | None = None,
    sort: Literal["name", "created", "users", "plan"] = "created",
    dir: Literal["asc", "desc"] = "desc", created_from: date | None = None,
    created_to: date | None = None,
):
    rows, total = await TenantRepository(db).admin_page(page_params.offset, page_params.limit, {
        "q": q, "status": status, "plan": plan, "country": country, "industry": industry,
        "businessType": businessType, "heardAbout": heardAbout, "size": size, "feature": feature, "featureState": featureState, "sort": sort, "dir": dir,
        "from": created_from.isoformat() if created_from else None,
        "to": created_to.isoformat() if created_to else None,
    })
    from app.modules.tenants.schemas import TenantRead
    tenants = [TenantRead.model_validate(t) for t in rows]
    usage = await _tenant_usage_map(db, [t.id for t in tenants])
    items = [{**t.model_dump(), "usage": usage.get(t.id, _empty_usage())} for t in tenants]
    return paginated_response(
        items=items, total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="All tenants retrieved",
    )


class AdminTenantCreate(TenantCreate):
    owner_full_name: str = Field(min_length=1, max_length=255)
    owner_email: EmailStr


@router.get("/audience")
async def admin_audience(
    db: DbSession, _: SuperUser, page_params: PageQuery, q: str | None = None, plan: str | None = None,
    country: str | None = None, preferred_contact: Literal["email", "phone", "whatsapp"] | None = None,
    status: Literal["all", "active", "suspended"] = "active",
    sort: Literal["name", "created", "last_active"] = "created", dir: Literal["asc", "desc"] = "desc",
):
    """Contactable businesses for marketing: one row per business with its owner's name/email and the business phone.
    Platform-staff only. Archived businesses never appear; owners come from the earliest active owner user."""
    owner = (select(User.tenant_id, User.full_name.label("owner_name"), User.email.label("owner_email"), User.last_login.label("owner_last_login"))
             .where(User.role == "owner", User.is_active.is_(True), User.tenant_id.isnot(None))
             .distinct(User.tenant_id).order_by(User.tenant_id, User.created_at).subquery())
    stmt = (select(Tenant, owner.c.owner_name, owner.c.owner_email, owner.c.owner_last_login)
            .outerjoin(owner, owner.c.tenant_id == Tenant.id).where(Tenant.archived_at.is_(None)))
    if status != "all":
        stmt = stmt.where(Tenant.is_active.is_(status == "active"))
    if plan:
        stmt = stmt.where(Tenant.subscription_plan == plan)
    if country:
        stmt = stmt.where(Tenant.country == country)
    if preferred_contact:
        stmt = stmt.where(Tenant.preferred_contact == preferred_contact)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Tenant.name.ilike(like), Tenant.phone.ilike(like), owner.c.owner_email.ilike(like), owner.c.owner_name.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    order_col = {"name": func.lower(Tenant.name), "created": Tenant.created_at, "last_active": owner.c.owner_last_login}[sort]
    order = order_col.asc().nulls_last() if dir == "asc" else order_col.desc().nulls_last()
    rows = (await db.execute(stmt.order_by(order, Tenant.id).offset(page_params.offset).limit(page_params.limit))).all()
    items = [{
        "id": str(t.id), "name": t.name, "owner_name": name, "owner_email": email, "phone": t.phone, "country": t.country, "city": t.city,
        "plan": t.subscription_plan, "subscription_status": t.subscription_status, "is_active": t.is_active,
        "preferred_contact": t.preferred_contact, "marketing_opt_out": t.marketing_opt_out, "industry": t.industry, "created_at": t.created_at, "last_active_at": last,
    } for t, name, email, last in rows]
    return paginated_response(items=items, total=total, page=page_params.page, page_size=page_params.page_size, message="Audience retrieved")


@router.post("/tenants", status_code=201)
async def admin_create_tenant(data: AdminTenantCreate, db: DbSession, admin: SuperUser):
    from app.modules.admin.service import onboard_business
    tenant = await onboard_business(db, TenantCreate.model_validate(data.model_dump()),
                                    data.owner_full_name, data.owner_email, admin)
    invalidate_analytics_cache()
    return success_response(data=tenant.model_dump(), message="Tenant and owner created", status_code=201)


@router.get("/tenants/{tenant_id}")
async def admin_get_tenant(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    tenant = await service.get_by_id(db, tenant_id)
    return success_response(data=tenant.model_dump(), message="Tenant retrieved")


@router.patch("/tenants/{tenant_id}")
async def admin_update_tenant(tenant_id: uuid.UUID, data: TenantUpdate, db: DbSession, admin: SuperUser):
    tenant = await service.update_tenant(db, tenant_id, data)
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.update", entity_type="tenant", entity_id=str(tenant_id),
        summary=f"Tenant '{tenant.name}' updated",
        changes=data.model_dump(exclude_unset=True),
    )
    await db.commit()
    invalidate_analytics_cache()
    return success_response(data=tenant.model_dump(), message="Tenant updated")


@router.post("/tenants/{tenant_id}/reset-data")
async def admin_reset_tenant_data(tenant_id: uuid.UUID, _: SuperUser) -> None:
    raise AppError(
        "Tenant-wide data reset is disabled. Use Data Management to prepare a reviewed operation with dependency checks and required approval.",
        status_code=410,
    )


# ── Tenant detail sub-resources ───────────────────────────────────────────────

@router.get("/tenants/{tenant_id}/stats")
async def admin_tenant_stats(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    users = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id))).scalar_one()
    orders = (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))).scalar_one()
    completed = (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id, Order.status == "Completed"))).scalar_one()
    revenue = (await _tenant_usage_map(db, [tenant_id])).get(tenant_id, _empty_usage())["revenue"]
    products = (await db.execute(select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id))).scalar_one()
    from app.modules.accounting.models.expense import Expense
    from app.modules.sales.models.customer import Customer
    customers = (await db.execute(select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id))).scalar_one()
    expenses = (await db.execute(select(func.coalesce(func.sum(func.coalesce(Expense.base_amount, Expense.amount)), 0)).where(Expense.tenant_id == tenant_id, Expense.status == "Approved"))).scalar_one()
    stock_value = (await db.execute(select(func.coalesce(func.sum(Product.cost * Product.stock), 0)).where(Product.tenant_id == tenant_id))).scalar_one()
    return success_response(data={
        "users": users, "orders": orders, "completed_orders": completed,
        "revenue": float(revenue), "products": products, "customers": customers, "expenses": float(expenses), "stock_value": float(stock_value),
    }, message="Tenant stats retrieved")


@router.get("/tenants/{tenant_id}/locations")
async def admin_tenant_locations(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    """Branches and warehouses of one business with their real counts: users and warehouses per branch, products, units and stock value per warehouse (from the stock ledger)."""
    from app.modules.inventory.models.warehouse import StockMovement, Warehouse
    from app.modules.tenants.models import Branch
    await service.get_by_id(db, tenant_id)
    branches = (await db.execute(select(Branch).where(Branch.tenant_id == tenant_id).order_by(Branch.name))).scalars().all()
    users_by_branch = dict((await db.execute(select(User.branch_id, func.count()).where(User.tenant_id == tenant_id, User.branch_id.is_not(None)).group_by(User.branch_id))).all())
    warehouses = (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id).order_by(Warehouse.name))).scalars().all()
    per = select(StockMovement.warehouse_id, StockMovement.product_id, func.sum(StockMovement.quantity).label("qty")).where(StockMovement.tenant_id == tenant_id).group_by(StockMovement.warehouse_id, StockMovement.product_id).subquery()
    stock = {r.warehouse_id: r for r in (await db.execute(
        select(per.c.warehouse_id, func.count().filter(per.c.qty > 0).label("products"), func.coalesce(func.sum(per.c.qty), 0).label("units"), func.coalesce(func.sum(per.c.qty * Product.cost), 0).label("value"))
        .select_from(per.join(Product, Product.id == per.c.product_id)).group_by(per.c.warehouse_id))).all()}
    by_branch: dict = {}
    for w in warehouses:
        by_branch[w.branch_id] = by_branch.get(w.branch_id, 0) + 1
    return success_response(data={
        "branches": [{"id": str(b.id), "name": b.name, "location": b.location, "status": b.status, "users": users_by_branch.get(b.id, 0), "warehouses": by_branch.get(b.id, 0), "created_at": b.created_at} for b in branches],
        "warehouses": [{"id": str(w.id), "code": w.code, "name": w.name, "branch_id": str(w.branch_id) if w.branch_id else None, "branch_name": w.branch.name if w.branch else None, "is_active": w.is_active, "is_default": w.is_default,
                        "address": w.address, "products": int(stock[w.id].products) if w.id in stock else 0, "units": float(stock[w.id].units) if w.id in stock else 0.0, "stock_value": float(stock[w.id].value) if w.id in stock else 0.0,
                        "created_at": w.created_at} for w in warehouses],
    }, message="Locations retrieved")


@router.get("/tenants/{tenant_id}/records")
async def admin_tenant_records(
    tenant_id: uuid.UUID,
    section: TenantRecordSection,
    db: DbSession,
    _: SuperUser,
    page_params: PageQuery,
    q: str | None = Query(None, max_length=100),
    status: str | None = Query(None, max_length=50),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Read-only, paginated business records for the selected tenant."""
    if date_from and date_to and date_from > date_to:
        raise ValidationError("Start date must be on or before end date")
    tenant = await service.get_by_id(db, tenant_id)
    items, total = await list_tenant_records(
        db, tenant_id, tenant.currency, section, page_params, q, status, date_from, date_to,
    )
    return paginated_response(
        items=items,
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message=f"Tenant {section} records retrieved",
    )


@router.get("/tenants/{tenant_id}/users")
async def admin_list_tenant_users(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery):
    users = await service.list_users(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_users(db, tenant_id)
    return paginated_response(items=[u.model_dump() for u in users], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Tenant users retrieved")


# ── Invite / onboard user to tenant ──────────────────────────────────────────

class InviteUserPayload(TrimmedModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: Literal["owner", "admin", "member", "viewer"] = "member"
    # Optional: set by the inviting admin when they intend to hand the
    # credentials to the person directly. Left blank, a strong random one is
    # generated instead (same pattern as the reset-password endpoint).
    password: str | None = None


@router.post("/tenants/{tenant_id}/invite", status_code=201)
async def admin_invite_user(tenant_id: uuid.UUID, data: InviteUserPayload, db: DbSession, admin: SuperUser):
    repo = UserRepository(db)
    existing = await repo.get_by_email_global(data.email)
    if existing:
        raise ConflictError(f"User with email '{data.email}' already exists")
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")
    await service.enforce_limit(db, tenant_id, "max_users", await service.count_users(db, tenant_id), noun="user")
    if data.password:
        validate_password_strength(data.password)
        temp_password = data.password
    else:
        temp_password = secrets.token_urlsafe(12)
    # Without this, the invited user gets role_id=None -> zero permissions ->
    # an almost-empty sidebar, since every module nav item is gated on a
    # permission the frontend derives from role_rel.permissions.
    role_id = await service.resolve_role_id(db, tenant_id, data.role)
    user = User(
        tenant_id=tenant_id,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        role_id=role_id,
        hashed_password=hash_password(temp_password),
        is_active=True,
        is_superuser=data.role == "owner",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="user.invite", entity_type="user", entity_id=str(user.id),
        summary=f"User '{user.email}' invited to tenant",
    )
    await db.commit()
    await send_invite_email(
        to=user.email,
        full_name=user.full_name,
        tenant_name=tenant.name,
        temp_password=temp_password,
    )
    invalidate_analytics_cache()
    return success_response(
        data={"id": str(user.id), "email": user.email, "full_name": user.full_name, "temp_password": temp_password},
        message="User invited successfully", status_code=201)


@router.get("/tenants/{tenant_id}/branches")
async def admin_list_tenant_branches(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery):
    branches = await service.list_branches(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_branches(db, tenant_id)
    return paginated_response(items=[b.model_dump() for b in branches], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Tenant branches retrieved")


@router.get("/tenants/{tenant_id}/departments")
async def admin_list_tenant_departments(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery):
    departments = await service.list_departments(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_departments(db, tenant_id)
    return paginated_response(items=[d.model_dump() for d in departments], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Tenant departments retrieved")


@router.get("/tenants/{tenant_id}/roles")
async def admin_list_tenant_roles(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery):
    roles = await service.list_roles(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_roles(db, tenant_id)
    return paginated_response(items=[r.model_dump() for r in roles], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Tenant roles retrieved")


# ── Feature catalog & tenant entitlements ─────────────────────────────────────

@router.get("/features")
async def admin_list_features(db: DbSession, _: SuperUser):
    flags = await service.list_feature_flags(db)
    return success_response(data=[f.model_dump() for f in flags], message="Feature catalog retrieved")


@router.get("/tenants/{tenant_id}/features")
async def admin_get_tenant_features(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    states = await service.get_tenant_feature_state(db, tenant_id)
    return success_response(data=[s.model_dump() for s in states], message="Tenant features retrieved")


@router.patch("/tenants/{tenant_id}/features")
async def admin_set_tenant_features(tenant_id: uuid.UUID, data: FeatureOverrideUpdate, db: DbSession, admin: SuperUser):
    states = await service.set_tenant_features(db, tenant_id, data)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.features.update", entity_type="tenant", entity_id=str(tenant_id),
        summary="Tenant feature overrides updated",
        changes=data.model_dump(exclude_unset=True),
    )
    await db.commit()
    return success_response(data=[s.model_dump() for s in states], message="Tenant features updated")


@router.post("/tenants/{tenant_id}/features/reset")
async def admin_reset_tenant_features(tenant_id: uuid.UUID, db: DbSession, admin: SuperUser):
    states = await service.reset_tenant_features(db, tenant_id)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.features.reset", entity_type="tenant", entity_id=str(tenant_id),
        summary="Tenant feature overrides reset to defaults",
    )
    await db.commit()
    return success_response(data=[s.model_dump() for s in states], message="Tenant features reset to defaults")


@router.get("/tenants/{tenant_id}/limits")
async def admin_get_tenant_limits(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    limits = await service.get_tenant_limits(db, tenant_id)
    return success_response(data=limits.model_dump(), message="Tenant limits retrieved")


@router.patch("/tenants/{tenant_id}/limits")
async def admin_set_tenant_limits(tenant_id: uuid.UUID, data: TenantLimitsUpdate, db: DbSession, admin: SuperUser):
    limits = await service.set_tenant_limits(db, tenant_id, data)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.limits.update", entity_type="tenant", entity_id=str(tenant_id),
        summary="Tenant limits updated",
        changes=data.model_dump(exclude_unset=True),
    )
    await db.commit()
    return success_response(data=limits.model_dump(), message="Tenant limits updated")


# ── Tenant sub-resource management (create / delete) ─────────────────────────

@router.post("/tenants/{tenant_id}/departments", status_code=201)
async def admin_create_tenant_department(tenant_id: uuid.UUID, data: DepartmentCreate, db: DbSession, _: SuperUser):
    dept = await service.create_department(db, tenant_id, data)
    return success_response(data=dept.model_dump(), message="Department created", status_code=201)


@router.delete("/tenants/{tenant_id}/departments/{department_id}")
async def admin_delete_tenant_department(tenant_id: uuid.UUID, department_id: uuid.UUID, db: DbSession, _: SuperUser):
    await service.delete_department(db, tenant_id, department_id)
    return success_response(message="Department deleted")


@router.post("/tenants/{tenant_id}/roles", status_code=201)
async def admin_create_tenant_role(tenant_id: uuid.UUID, data: RoleCreate, db: DbSession, _: SuperUser):
    role = await service.create_role(db, tenant_id, data)
    return success_response(data=role.model_dump(), message="Role created", status_code=201)


@router.delete("/tenants/{tenant_id}/roles/{role_id}")
async def admin_delete_tenant_role(tenant_id: uuid.UUID, role_id: uuid.UUID, db: DbSession, _: SuperUser):
    await service.delete_role(db, tenant_id, role_id)
    return success_response(message="Role deleted")


@router.post("/tenants/{tenant_id}/branches", status_code=201)
async def admin_create_tenant_branch(tenant_id: uuid.UUID, data: BranchCreate, db: DbSession, _: SuperUser):
    branch = await service.create_branch(db, tenant_id, data)
    return success_response(data=branch.model_dump(), message="Branch created", status_code=201)


@router.delete("/tenants/{tenant_id}/branches/{branch_id}")
async def admin_delete_tenant_branch(tenant_id: uuid.UUID, branch_id: uuid.UUID, db: DbSession, _: SuperUser):
    await service.delete_branch(db, tenant_id, branch_id)
    return success_response(message="Branch deleted")


@router.delete("/tenants/{tenant_id}/users/{user_id}")
async def admin_delete_tenant_user(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, admin: SuperUser):
    user = await db.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise NotFoundError("User not found in tenant")
    if user.is_superuser:
        raise ConflictError("Cannot remove a superuser")
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="user.delete", entity_type="user", entity_id=str(user_id),
        summary=f"User '{user.email}' removed from tenant",
    )
    await db.delete(user)
    await db.commit()
    invalidate_analytics_cache()
    return success_response(message="User removed")


class EmployeeFeatureUpdate(BaseModel):
    enabled: bool


@router.get("/tenants/{tenant_id}/users/{user_id}/access")
async def admin_employee_access(
    tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, _: SuperUser,
):
    from app.modules.admin.user_access import employee_access

    return success_response(data=await employee_access(db, tenant_id, user_id))


@router.patch("/tenants/{tenant_id}/users/{user_id}/access/{module}")
async def admin_employee_feature(
    tenant_id: uuid.UUID, user_id: uuid.UUID, module: str,
    data: EmployeeFeatureUpdate, db: DbSession, admin: SuperUser,
):
    from app.modules.admin.user_access import set_employee_feature

    result = await set_employee_feature(db, tenant_id, user_id, module, data.enabled, admin)
    return success_response(data=result, message="Employee feature access updated")


class EmployeePermissionsUpdate(BaseModel):
    permission_ids: list[uuid.UUID] = Field(max_length=1000)
    expected_role_id: uuid.UUID | None
    expected_permission_ids: list[uuid.UUID] = Field(max_length=1000)
    scope: Literal["user", "role"] = "user"


class EmployeeStatusUpdate(BaseModel):
    is_active: bool


@router.get("/tenants/{tenant_id}/team/users")
async def admin_team_users(
    tenant_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery,
    search: str | None = None, role_id: uuid.UUID | None = None, is_active: bool | None = None,
):
    users = await service.list_users(db, tenant_id, page_params.offset, page_params.limit, search, is_active, role_id)
    total = await service.count_users(db, tenant_id, search, is_active, role_id)
    return paginated_response(items=[u.model_dump() for u in users], total=total,
                              page=page_params.page, page_size=page_params.page_size)


@router.post("/tenants/{tenant_id}/team/invite")
async def admin_team_invite(tenant_id: uuid.UUID, data: UserCreate, db: DbSession, admin: SuperUser):
    from app.modules.admin.user_access import invite_employee

    user = await invite_employee(db, tenant_id, data, admin)
    return success_response(data=user.model_dump(), message="User created; invitation email requested", status_code=201)


@router.get("/tenants/{tenant_id}/team/users/{user_id}")
async def admin_team_user(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, _: SuperUser):
    from app.modules.admin.user_access import employee_details

    return success_response(data=(await employee_details(db, tenant_id, user_id)).model_dump())


@router.patch("/tenants/{tenant_id}/team/users/{user_id}")
async def admin_team_update(tenant_id: uuid.UUID, user_id: uuid.UUID, data: UserUpdate, db: DbSession, admin: SuperUser):
    from app.modules.admin.user_access import edit_employee

    return success_response(data=(await edit_employee(db, tenant_id, user_id, data, admin)).model_dump())


@router.patch("/tenants/{tenant_id}/team/users/{user_id}/status")
async def admin_team_status(tenant_id: uuid.UUID, user_id: uuid.UUID, data: EmployeeStatusUpdate, db: DbSession, admin: SuperUser):
    result = await service.set_user_active(db, tenant_id, user_id, data.is_active, actor=admin)
    return success_response(data=result.model_dump())


@router.get("/tenants/{tenant_id}/team/users/{user_id}/permissions")
async def admin_team_permissions(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, _: SuperUser):
    from app.modules.admin.user_access import employee_permissions

    return success_response(data=await employee_permissions(db, tenant_id, user_id))


@router.put("/tenants/{tenant_id}/team/users/{user_id}/permissions")
async def admin_team_save_permissions(
    tenant_id: uuid.UUID, user_id: uuid.UUID, data: EmployeePermissionsUpdate, db: DbSession, admin: SuperUser,
):
    from app.modules.admin.user_access import save_employee_permissions

    result = await save_employee_permissions(db, tenant_id, user_id, data.permission_ids,
                                            data.expected_role_id, data.expected_permission_ids, data.scope, admin)
    return success_response(data=result, message="Permissions updated")


@router.get("/tenants/{tenant_id}/team/users/{user_id}/activity")
async def admin_team_activity(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery):
    items, total = await service.get_user_activity(db, tenant_id, user_id, page_params.offset, page_params.limit)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size)


@router.delete("/tenants/{tenant_id}/team/users/{user_id}")
async def admin_team_remove(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, admin: SuperUser):
    await service.delete_user(db, tenant_id, user_id, actor=admin)
    return success_response(message="User removed")


class TeamRolePermissionsUpdate(BaseModel):
    permission_ids: list[uuid.UUID] = Field(max_length=1000)
    expected_permission_ids: list[uuid.UUID] = Field(max_length=1000)


@router.get("/tenants/{tenant_id}/team/roles/{role_id}/permissions")
async def admin_team_role_permissions(tenant_id: uuid.UUID, role_id: uuid.UUID, db: DbSession, _: SuperUser):
    from app.modules.admin.user_access import team_role_permissions

    return success_response(data=await team_role_permissions(db, tenant_id, role_id))


@router.put("/tenants/{tenant_id}/team/roles/{role_id}/permissions")
async def admin_team_role_save(tenant_id: uuid.UUID, role_id: uuid.UUID, data: TeamRolePermissionsUpdate, db: DbSession, admin: SuperUser):
    from app.modules.admin.user_access import save_team_role_permissions

    result = await save_team_role_permissions(db, tenant_id, role_id, data.permission_ids, data.expected_permission_ids, admin)
    return success_response(data=result, message="Role permissions updated")
