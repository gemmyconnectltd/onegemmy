import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.period import PeriodQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import CustomerBulkCreate, CustomerCreateStrict, CustomerUpdate
from app.modules.sales.service import customer_profile

router = APIRouter(tags=["Sales - Customers"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/customers")
async def list_customers(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: PeriodQuery, search: str | None = None, customer_type: str | None = None,
                         status: Literal["current", "active", "inactive", "archived", "all"] | None = None, figures: bool = False):
    """Customers, without archived ones unless asked (status). figures=true adds each customer's orders, completed sales,
    last order and unpaid balance, aggregated in one query for the page."""
    _require_tenant(current_user.tenant_id)
    items = await service.list_customers(db, current_user.tenant_id, page_params.offset, page_params.limit, search, customer_type, period, status, figures)
    total = await service.count_customers(db, current_user.tenant_id, search, customer_type, period, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Customers retrieved successfully")


@router.post("/sales/customers")
async def create_customer(data: CustomerCreateStrict, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if data.credit_daily_limit is not None and not current_user.is_superuser and "credit:approve" not in current_user.permissions_names:
        raise ForbiddenError("Permission required: credit:approve")
    obj = await service.create_customer(db, current_user.tenant_id, data, actor=current_user)
    return success_response(data=obj.model_dump(), message="Customer created successfully", status_code=201)


@router.post("/sales/customers/bulk")
async def bulk_create_customers(data: CustomerBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if any(item.credit_daily_limit is not None for item in data.items) and not current_user.is_superuser and "credit:approve" not in current_user.permissions_names:
        raise ForbiddenError("Permission required: credit:approve")
    result = await service.bulk_create_customers(db, current_user.tenant_id, data)
    return success_response(data=result.model_dump(), message=f"{result.created} customers imported", status_code=201)


@router.get("/sales/customers/{id}/profile")
async def customer_profile_view(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    return success_response(data=await customer_profile.profile(db, current_user, branch, id), message="Customer profile retrieved successfully")


@router.get("/sales/customers/{id}/records/{section}")
async def customer_records(id: uuid.UUID, section: str, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, page_params: PageQuery):
    return success_response(data=await customer_profile.section(db, current_user, branch, id, section, page_params.page, min(page_params.page_size, 50)),
                            message="Customer records retrieved successfully")


@router.get("/sales/customers/{id}")
async def get_customer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_customer(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Customer retrieved successfully")


@router.patch("/sales/customers/{id}")
async def update_customer(id: uuid.UUID, data: CustomerUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if "credit_daily_limit" in data.model_fields_set and not current_user.is_superuser and "credit:approve" not in current_user.permissions_names:
        raise ForbiddenError("Permission required: credit:approve")
    obj = await service.update_customer(db, current_user.tenant_id, id, data, actor=current_user)
    return success_response(data=obj.model_dump(), message="Customer updated successfully")


@router.delete("/sales/customers/{id}")
async def delete_customer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    """Permanent deletion: owners/administrators only (enforced by the access layer), and refused while any sale, payment,
    debt, quotation or other record refers to the customer."""
    _require_tenant(current_user.tenant_id)
    from app.modules.sales.service.customer_lifecycle import delete_permanently
    await delete_permanently(db, current_user.tenant_id, id, current_user)
    return success_response(message="Customer deleted successfully")


@router.get("/sales/customers/{id}/dependencies")
async def customer_dependencies(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    """What refers to the customer, so the screen can say why deletion is unavailable before anyone tries."""
    _require_tenant(current_user.tenant_id)
    from app.modules.sales.service.customer_lifecycle import _get, dependencies
    await _get(db, current_user.tenant_id, id)
    linked = await dependencies(db, current_user.tenant_id, id)
    return success_response(data={"linked": linked, "deletable": not linked})


@router.get("/sales/customers/{id}/activity")
async def customer_activity(id: uuid.UUID, db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    """What happened to this customer record (created, edited, deactivated, archived, reactivated), from the audit log."""
    _require_tenant(current_user.tenant_id)
    if not (current_user.is_superuser or (current_user.role or "").lower() in ("owner", "admin") or "contacts:read" in current_user.permissions_names):
        raise ForbiddenError("Permission required: contacts:read")
    from sqlalchemy import func, select

    from app.modules.audit.models.audit import AuditLog
    from app.modules.sales.service.customer_lifecycle import _get
    await _get(db, current_user.tenant_id, id)
    where = (AuditLog.tenant_id == current_user.tenant_id, AuditLog.entity_type == "customer", AuditLog.entity_id == str(id))
    total = await db.scalar(select(func.count()).select_from(AuditLog).where(*where))
    rows = (await db.execute(select(AuditLog).where(*where).order_by(AuditLog.created_at.desc())
                             .offset(page_params.offset).limit(page_params.limit))).scalars().all()
    items = [{"id": str(r.id), "action": r.action, "summary": r.summary, "actor": r.actor_name, "changes": r.changes, "at": r.created_at} for r in rows]
    return paginated_response(items=items, total=total or 0, page=page_params.page, page_size=page_params.page_size, message="Customer activity")


class CustomerStatusIn(BaseModel):
    status: Literal["active", "inactive", "archived"]


@router.post("/sales/customers/{id}/status")
async def set_customer_status(id: uuid.UUID, data: CustomerStatusIn, db: DbSession, current_user: CurrentUser):
    """Deactivate, archive or reactivate (contacts:update). History, debts and journals are never touched."""
    _require_tenant(current_user.tenant_id)
    from app.modules.sales.service.customer_lifecycle import set_status
    await set_status(db, current_user.tenant_id, id, data.status, current_user)
    obj = await service.get_customer(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message=f"Customer {data.status}")
