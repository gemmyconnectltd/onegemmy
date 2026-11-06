import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.admin.data_management.explorer import spec_for
from app.modules.admin.data_management.models import DataManagementRequest, DataOperation
from app.modules.audit.service import record_audit

router = APIRouter(tags=["Business Data Management Requests"])


class CreateRequest(BaseModel):
    module: str = Field(min_length=1, max_length=30)
    date_type: str | None = Field(default=None, max_length=30)
    from_date: date
    to_date: date
    reason: str = Field(min_length=10, max_length=1000)


def _owner_tenant(current_user: CurrentUser) -> uuid.UUID:
    if current_user.tenant_id is None or (current_user.role or "").strip().lower() not in {"owner", "owner/ceo"}:
        raise ForbiddenError("Only a business owner can request data removal review")
    return current_user.tenant_id


def _require_business_owner(current_user: CurrentUser) -> None:
    _owner_tenant(current_user)


def _dump(row: DataManagementRequest, operation_status: str | None = None, operation_reference: str | None = None) -> dict:
    status = row.status
    if operation_status:
        status = {
            "Prepared": "Preview prepared",
            "PendingApproval": "Awaiting second approval",
            "Approved": "Approved",
            "Executing": "In progress",
            "Completed": "Completed",
            "PartiallyCompleted": "Partially completed",
            "Failed": "Failed",
            "Rejected": "Rejected",
            "Expired": "Expired",
            "Cancelled": "Cancelled",
        }.get(operation_status, operation_status)
    return {
        "id": str(row.id),
        "module": row.module,
        "filters": row.filters,
        "reason": row.reason,
        "status": status,
        "requested_by": row.requested_by_name,
        "created_at": row.created_at,
        "review_note": row.review_note,
        "operation_id": str(row.operation_id) if row.operation_id else None,
        "operation_reference": operation_reference,
    }


@router.get("/data-management-requests/modules", dependencies=[Depends(_require_business_owner)])
async def available_modules(current_user: CurrentUser):
    _owner_tenant(current_user)
    from app.modules.admin.data_management.registry import MODULES

    modules = []
    for spec in MODULES.values():
        if not spec.cap("delete").supported or not spec.dates:
            continue
        modules.append({
            "key": spec.key,
            "label": spec.label,
            "date_types": [{"key": key, "label": label} for key, (_, label) in spec.dates.items()],
            "default_date_type": "transaction" if "transaction" in spec.dates else next(iter(spec.dates)),
        })
    return success_response(data=modules, message="Requestable modules retrieved")


@router.post("/data-management-requests", dependencies=[Depends(_require_business_owner)])
async def create_request(body: CreateRequest, current_user: CurrentUser, db: DbSession):
    tenant_id = _owner_tenant(current_user)
    if body.from_date > body.to_date:
        raise ValidationError("The start date must not be after the end date")
    reason = body.reason.strip()
    if len(reason) < 10:
        raise ValidationError("The reason must be at least 10 characters")
    spec = spec_for(body.module)
    if not spec.cap("delete").supported:
        raise ValidationError(f"{spec.label} does not support safe record removal")
    if not spec.dates:
        raise ValidationError(f"{spec.label} cannot be filtered by date")
    date_type = body.date_type or ("transaction" if "transaction" in spec.dates else next(iter(spec.dates)))
    if date_type not in spec.dates:
        raise ValidationError(f"{spec.label} has no '{date_type}' date")
    filters = {"date_type": date_type, "preset": "custom", "from": body.from_date.isoformat(), "to": body.to_date.isoformat()}
    request = DataManagementRequest(tenant_id=tenant_id, module=spec.key, filters=filters, reason=reason, requested_by=current_user.id,
                                    requested_by_name=current_user.full_name or current_user.email)
    db.add(request)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=current_user.id, actor_name=current_user.full_name, action="data_management.requested",
        entity_type="data_management_request", entity_id=str(request.id), summary=f"Requested platform review to remove {spec.label} records",
        changes={"module": spec.key, "filters": filters, "reason": reason},
    )
    await db.commit()
    await db.refresh(request)
    return success_response(data=_dump(request), message="Request sent for platform review", status_code=201)


@router.get("/data-management-requests", dependencies=[Depends(_require_business_owner)])
async def list_requests(current_user: CurrentUser, db: DbSession, page: PageQuery):
    tenant_id = _owner_tenant(current_user)
    base = select(DataManagementRequest).where(DataManagementRequest.tenant_id == tenant_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await db.execute(
        select(DataManagementRequest, DataOperation.status, DataOperation.reference)
        .outerjoin(DataOperation, DataOperation.id == DataManagementRequest.operation_id)
        .where(DataManagementRequest.tenant_id == tenant_id)
        .order_by(DataManagementRequest.created_at.desc())
        .offset(page.offset)
        .limit(page.limit)
    )).all()
    return paginated_response(
        items=[_dump(row, operation_status, operation_reference) for row, operation_status, operation_reference in rows],
        total=total or 0,
        page=page.page,
        page_size=page.page_size,
        message="Data removal requests retrieved",
    )
