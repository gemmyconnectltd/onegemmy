import secrets
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select, text

from app.core.deps import DbSession, SuperUser
from app.core.email import send_invite_email
from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.core.security import hash_password
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
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
    return paginated_response(
        items=[t.model_dump() for t in tenants], total=total,
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
    tenant = await service.update_tenant(db, tenant_id, TenantUpdate(is_active=True))
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
        action="tenant.activate", entity_type="tenant", entity_id=str(tenant_id),
        summary=f"Tenant '{tenant.name}' activated",
    )
    await db.commit()
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
    password: str


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
    user = User(
        tenant_id=tenant_id,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        hashed_password=hash_password(data.password),
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
        temp_password=data.password,
    )
    return success_response(data={"id": str(user.id), "email": user.email, "full_name": user.full_name},
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
