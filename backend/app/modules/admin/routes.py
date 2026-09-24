import secrets
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import DbSession, SuperUser
from app.core.email import send_account_approved_email, send_invite_email
from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.core.security import hash_password, validate_password_strength
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.audit.service import record_audit
from app.modules.hr.models.employee import Employee
from app.modules.inventory.models.product import Product
from app.modules.manufacturing.models.production_order import ProductionOrder
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.repairs.models.job import RepairJob
from app.modules.sales.models.deal import Deal
from app.modules.sales.models.order import Order
from app.modules.tenants import service
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import TenantRepository, UserRepository
from app.modules.tenants.schemas import (
    BranchCreate,
    DepartmentCreate,
    FeatureOverrideUpdate,
    RoleCreate,
    TenantCreate,
    TenantLimitsUpdate,
    TenantUpdate,
)

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
        select(Transaction.tenant_id, func.coalesce(func.sum(TransactionLine.amount), 0).label("revenue"))
        .join(TransactionLine, TransactionLine.transaction_id == Transaction.id)
        .where(
            Transaction.tenant_id.in_(tenant_ids), Transaction.type == "sale",
            Transaction.status == "Posted", TransactionLine.type == "credit",
        )
        .group_by(Transaction.tenant_id)
    )).fetchall()
    for r in revenue_rows:
        usage[r.tenant_id]["revenue"] = float(r.revenue)

    return usage


# ── Platform stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(db: DbSession, _: SuperUser):
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()
    active_tenants = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_active == True))).scalar_one()
    total_users = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id.isnot(None)))).scalar_one()
    total_orders = (await db.execute(select(func.count()).select_from(Order))).scalar_one()
    completed_orders = (await db.execute(select(func.count()).select_from(Order).where(Order.status == "Completed"))).scalar_one()
    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(TransactionLine.amount), 0))
        .join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.type == "sale", Transaction.status == "Posted", TransactionLine.type == "credit")
    )).scalar_one()
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
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "suspended_tenants": total_tenants - active_tenants,
        "total_users": total_users,
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "total_revenue": float(total_revenue),
        "total_products": total_products,
        "plans": plans,
        "monthly_signups": [{"month": r.month, "count": r.cnt} for r in monthly],
    }, message="Platform stats retrieved")


# One row per core module — each is a single count query against that
# module's own table (tenant-scoped), never per-tenant, so this stays cheap
# no matter how many tenants exist.
_FEATURE_MODULES = [
    ("sales", "Sales", Order),
    ("inventory", "Inventory", Product),
    ("accounting", "Accounting", Transaction),
    ("hr", "HR", Employee),
    ("procurement", "Purchases", PurchaseOrder),
    ("manufacturing", "Manufacturing", ProductionOrder),
    ("crm", "CRM", Deal),
    ("repairs", "Repairs", RepairJob),
]


@router.get("/feature-usage")
async def admin_feature_usage(db: DbSession, _: SuperUser):
    """How much each core module is actually being used platform-wide —
    adoption (tenants with at least one record) and volume (total records)."""
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()

    modules = []
    for key, label, model in _FEATURE_MODULES:
        row = (await db.execute(
            select(
                func.count(func.distinct(model.tenant_id)).label("tenants_using"),
                func.count().label("total_records"),
            ).select_from(model)
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
        expr = func.coalesce(func.nullif(col, ""), "Unknown")
        rows = (await db.execute(
            select(expr.label("name"), func.count().label("cnt"))
            .group_by(expr).order_by(func.count().desc())
        )).fetchall()
        return [{"name": r.name, "value": r.cnt} for r in rows if r.name != "Unknown"]

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

    return success_response(data={
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
    tier = case(
        (func.coalesce(order_counts.c.cnt, 0) == 0, "dormant"),
        (func.coalesce(order_counts.c.cnt, 0) < 10, "light"),
        (func.coalesce(order_counts.c.cnt, 0) < 50, "moderate"),
        else_="heavy",
    )
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
    plan_revenue = {
        r.subscription_plan: float(r.revenue) for r in (await db.execute(
            select(
                Tenant.subscription_plan,
                func.coalesce(func.sum(TransactionLine.amount), 0).label("revenue"),
            )
            .select_from(Transaction)
            .join(Tenant, Tenant.id == Transaction.tenant_id)
            .join(TransactionLine, TransactionLine.transaction_id == Transaction.id)
            .where(
                Transaction.type == "sale", Transaction.status == "Posted",
                TransactionLine.type == "credit",
            )
            .group_by(Tenant.subscription_plan)
        )).fetchall()
    }

    plan_keys = set(plan_tenants) | set(plan_users) | set(plan_orders) | set(plan_products) | set(plan_revenue)
    by_plan = [
        {
            "plan": p,
            "tenants": plan_tenants.get(p, 0),
            "users": plan_users.get(p, 0),
            "orders": (plan_orders.get(p) or {}).get("orders", 0),
            "completed_orders": (plan_orders.get(p) or {}).get("completed_orders", 0),
            "revenue": plan_revenue.get(p, 0.0),
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

    totals = {
        "total_orders": sum(r["orders"] for r in by_plan),
        "total_users": sum(r["users"] for r in by_plan),
        "total_products": sum(r["products"] for r in by_plan),
        "total_revenue": sum(r["revenue"] for r in by_plan),
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
        },
        "engagement": [
            {"tier": t, "tenants": engagement.get(t, 0)}
            for t in ("dormant", "light", "moderate", "heavy")
        ],
        "by_plan": by_plan,
        "top_tenants": top_tenants,
    }, message="Platform usage breakdown retrieved")


# ── Platform users ────────────────────────────────────────────────────────────

@router.get("/users")
async def admin_list_all_users(db: DbSession, _: SuperUser, page_params: PageQuery):
    stmt = (
        select(User, Tenant.name)
        .outerjoin(Tenant, Tenant.id == User.tenant_id)
        .order_by(User.created_at.desc())
        .offset(page_params.offset)
        .limit(page_params.limit)
    )
    rows = (await db.execute(stmt)).all()
    total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    items = [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "tenant_id": str(u.tenant_id) if u.tenant_id else None,
            "tenant_name": tname,
        }
        for u, tname in rows
    ]
    return paginated_response(items=items, total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="All users retrieved")


# ── Tenant CRUD ───────────────────────────────────────────────────────────────

@router.get("/tenants")
async def admin_list_tenants(db: DbSession, _: SuperUser, page_params: PageQuery):
    tenants = await service.list_all(db, page_params.offset, page_params.limit)
    total = await service.count_all(db)
    usage = await _tenant_usage_map(db, [t.id for t in tenants])
    items = [{**t.model_dump(), "usage": usage.get(t.id, _empty_usage())} for t in tenants]
    return paginated_response(
        items=items, total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="All tenants retrieved",
    )


@router.post("/tenants", status_code=201)
async def admin_create_tenant(data: TenantCreate, db: DbSession, admin: SuperUser):
    existing = await TenantRepository(db).get_by_slug(data.slug)
    if existing:
        raise ConflictError(f"Tenant slug '{data.slug}' already exists")
    tenant = await service.create_tenant(db, data)
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.create", entity_type="tenant", entity_id=str(tenant.id),
        summary=f"Tenant '{tenant.name}' created",
    )
    await db.commit()
    return success_response(data=tenant.model_dump(), message="Tenant created", status_code=201)


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
    return success_response(data=tenant.model_dump(), message="Tenant updated")


@router.post("/tenants/{tenant_id}/suspend")
async def admin_suspend_tenant(tenant_id: uuid.UUID, db: DbSession, admin: SuperUser):
    tenant = await service.update_tenant(db, tenant_id, TenantUpdate(is_active=False))
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.suspend", entity_type="tenant", entity_id=str(tenant_id),
        summary=f"Tenant '{tenant.name}' suspended",
    )
    await db.commit()
    return success_response(data=tenant.model_dump(), message="Tenant suspended")


@router.post("/tenants/{tenant_id}/activate")
async def admin_activate_tenant(tenant_id: uuid.UUID, db: DbSession, admin: SuperUser):
    existing = await db.get(Tenant, tenant_id)
    was_pending_signup = existing is not None and existing.subscription_status == "pending"
    update = TenantUpdate(is_active=True, subscription_status="active") if was_pending_signup else TenantUpdate(is_active=True)
    tenant = await service.update_tenant(db, tenant_id, update)
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.activate", entity_type="tenant", entity_id=str(tenant_id),
        summary=f"Tenant '{tenant.name}' activated",
    )
    await db.commit()

    if was_pending_signup:
        owner = (await db.execute(
            select(User).where(User.tenant_id == tenant_id, User.role == "owner")
        )).scalar_one_or_none()
        if owner:
            await send_account_approved_email(
                to=owner.email,
                full_name=owner.full_name,
                tenant_name=tenant.name,
                dashboard_url=f"{settings.FRONTEND_URL}/dashboard",
            )
    return success_response(data=tenant.model_dump(), message="Tenant activated")


@router.delete("/tenants/{tenant_id}")
async def admin_delete_tenant(tenant_id: uuid.UUID, db: DbSession, admin: SuperUser):
    tenant = await service.get_by_id(db, tenant_id)
    await service.delete_tenant(db, tenant_id)
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.delete", entity_type="tenant", entity_id=str(tenant_id),
        summary=f"Tenant '{tenant.name if tenant else tenant_id}' deleted",
    )
    await db.commit()
    return success_response(message="Tenant deleted")


# ── Tenant detail sub-resources ───────────────────────────────────────────────

@router.get("/tenants/{tenant_id}/stats")
async def admin_tenant_stats(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    users = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id))).scalar_one()
    orders = (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))).scalar_one()
    completed = (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id, Order.status == "Completed"))).scalar_one()
    revenue = (await db.execute(
        select(func.coalesce(func.sum(TransactionLine.amount), 0))
        .join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .where(Transaction.tenant_id == tenant_id, Transaction.type == "sale",
               Transaction.status == "Posted", TransactionLine.type == "credit")
    )).scalar_one()
    products = (await db.execute(select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id))).scalar_one()
    return success_response(data={
        "users": users, "orders": orders, "completed_orders": completed,
        "revenue": float(revenue), "products": products,
    }, message="Tenant stats retrieved")


@router.get("/tenants/{tenant_id}/users")
async def admin_list_tenant_users(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, page_params: PageQuery):
    users = await service.list_users(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_users(db, tenant_id)
    return paginated_response(items=[u.model_dump() for u in users], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Tenant users retrieved")


# ── Invite / onboard user to tenant ──────────────────────────────────────────

class InviteUserPayload(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "member"
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
    user = User(
        tenant_id=tenant_id,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        hashed_password=hash_password(temp_password),
        is_active=True,
        is_superuser=False,
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
    return success_response(message="User removed")


@router.post("/tenants/{tenant_id}/users/{user_id}/reset-password")
async def admin_reset_tenant_user_password(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, admin: SuperUser):
    user = await db.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise NotFoundError("User not found in tenant")
    temp_password = secrets.token_urlsafe(12)
    user.hashed_password = hash_password(temp_password)
    await UserRepository(db).save(user)
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="user.password_reset", entity_type="user", entity_id=str(user_id),
        summary=f"Password reset for '{user.email}'",
    )
    await db.commit()
    log.info("admin.reset_password.success", extra={"_extra_fields": {"tenant_id": str(tenant_id), "user_id": str(user_id)}})
    return success_response(
        data={"user_id": str(user.id), "email": user.email, "full_name": user.full_name, "temp_password": temp_password},
        message="Password reset successfully",
    )
