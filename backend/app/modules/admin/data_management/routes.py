import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, func, select

from app.core.deps import DbSession, SuperUser
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.admin.data_management import explorer, plans
from app.modules.admin.data_management import permissions as perms
from app.modules.admin.data_management.models import (
    DataManagementRequest,
    DataOperation,
    DataSavedFilter,
)
from app.modules.admin.data_management.registry import MODULES, OP_LABEL
from app.modules.admin.models import TenantExport
from app.modules.audit.service import record_audit

router = APIRouter(prefix="/admin/data-management", tags=["Super Admin - Data Management"])


class Query_(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)
    sort: str | None = None
    descending: bool = True


class Prepare(BaseModel):
    module: str
    operation: str = Field(pattern="^(archive|delete|clean_test|correct|reset)$")
    selection: dict[str, Any] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class Submit(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)
    attest_test_data: bool = False


class Decision(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=500)


class Execute(BaseModel):
    idempotency_key: str | None = Field(default=None, max_length=64)
    confirm: dict[str, str] | None = None


class ApproveAndRun(Execute):
    reason: str = Field(default="", max_length=1000)
    attest_test_data: bool = False


class ApproveAndRunBatch(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=plans.BATCH_MAX)
    phrase: str = Field(max_length=20)


class PlatformDataSettings(BaseModel):
    require_second_approver: bool


class SaveFilter(BaseModel):
    module: str
    name: str = Field(min_length=1, max_length=100)
    tenant_id: uuid.UUID | None = None
    filters: dict[str, Any]


class RejectRequest(BaseModel):
    note: str = Field(min_length=3, max_length=1000)


def _require_request_queue_access(admin: SuperUser) -> None:
    if not (perms.has(admin, perms.PREVIEW) or perms.has(admin, perms.APPROVE)):
        raise ForbiddenError("Data Management permission required")


def _require_data_preview(admin: SuperUser) -> None:
    perms.require(admin, perms.PREVIEW)


def _require_data_approval(admin: SuperUser) -> None:
    perms.require(admin, perms.APPROVE)


@router.get("/me")
async def my_permissions(admin: SuperUser, db: DbSession):
    return success_response(data={"id": str(admin.id), "permissions": perms.granted(admin), "labels": perms.LABELS, "all": list(perms.ALL),
                                  "require_second_approver": await plans.second_approver_required(db)}, message="Permissions retrieved")


@router.get("/settings")
async def data_settings(admin: SuperUser, db: DbSession):
    if not perms.granted(admin):
        raise ForbiddenError("Data Management permission required")
    return success_response(data={"require_second_approver": await plans.second_approver_required(db)}, message="Settings retrieved")


@router.put("/settings")
async def update_data_settings(body: PlatformDataSettings, admin: SuperUser, db: DbSession):
    """Whether the administrator who requested an operation may also approve it. Changing it needs the approval permission and is audited."""
    perms.require(admin, perms.APPROVE)
    return success_response(data={"require_second_approver": await plans.set_second_approver_required(db, admin, body.require_second_approver)}, message="Settings saved")


@router.get("/meta")
async def meta(admin: SuperUser):
    perms.require(admin, perms.VIEW)
    return success_response(data={"operations": OP_LABEL, "modules": [{"key": m.key, "label": m.label, "group": m.group} for m in MODULES.values()]}, message="Data Management retrieved")


BUSINESS_SORTS = ("name", "plan", "country", "users", "branches", "created_at", "status")


def _status_of(t) -> str:
    return "Archived" if t.archived_at else "Active" if t.is_active else "Suspended"


@router.get("/summary")
async def summary(admin: SuperUser, db: DbSession):
    """Real numbers for the Data Management overview. A figure that cannot be worked out is null, never invented."""
    if not perms.granted(admin):
        raise ForbiddenError("Data Management permission required")
    from datetime import UTC, datetime, timedelta

    from app.modules.tenants.models import Tenant
    since = datetime.now(UTC) - timedelta(days=30)
    can_see_ops = perms.has(admin, perms.HISTORY)
    out: dict[str, Any] = {"businesses": None, "pending_requests": None, "awaiting_approval": None, "operations_30d": None, "finished_30d": None, "success_rate": None}
    if perms.has(admin, perms.VIEW):
        out["businesses"] = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()
    if perms.has(admin, perms.PREVIEW) or perms.has(admin, perms.APPROVE):
        out["pending_requests"] = (await db.execute(select(func.count()).select_from(DataManagementRequest).where(DataManagementRequest.status == "Submitted", DataManagementRequest.operation_id.is_(None)))).scalar_one()
    if can_see_ops or perms.has(admin, perms.APPROVE):
        out["awaiting_approval"] = (await db.execute(select(func.count()).select_from(DataOperation).where(DataOperation.status == "PendingApproval"))).scalar_one()
    if can_see_ops:
        rows = dict((await db.execute(select(DataOperation.status, func.count()).where(DataOperation.submitted_at.is_not(None), DataOperation.created_at >= since).group_by(DataOperation.status))).all())
        out["operations_30d"] = sum(rows.values())
        done = rows.get("Completed", 0) + rows.get("PartiallyCompleted", 0) + rows.get("Failed", 0)
        out["finished_30d"] = done
        out["success_rate"] = round(100 * rows.get("Completed", 0) / done, 1) if done else None  # nothing has finished yet: no rate to show
    return success_response(data=out, message="Summary retrieved")


@router.get("/businesses/facets")
async def business_facets(admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    from app.modules.tenants.models import Tenant
    plans = (await db.execute(select(Tenant.subscription_plan).where(Tenant.subscription_plan.is_not(None)).distinct().order_by(Tenant.subscription_plan))).scalars().all()
    countries = (await db.execute(select(Tenant.country).where(Tenant.country.is_not(None), Tenant.country != "").distinct().order_by(Tenant.country))).scalars().all()
    return success_response(data={"plans": plans, "countries": countries, "statuses": ["Active", "Suspended", "Archived"]}, message="Filters retrieved")


@router.get("/businesses")
async def businesses(admin: SuperUser, db: DbSession, page: PageQuery, search: str | None = Query(None, max_length=100), status: str | None = Query(None, pattern="^(Active|Suspended|Archived)$"),
                     plan: str | None = Query(None, max_length=50), country: str | None = Query(None, max_length=100), sort: str = Query("name"), descending: bool = False):
    """Businesses to choose from, filtered, sorted and paged on the server. Nothing about a business's records is shown until it is chosen."""
    perms.require(admin, perms.VIEW)
    from app.modules.tenants.models import Branch, Tenant, User
    if sort not in BUSINESS_SORTS:
        raise ValidationError("Unknown sort column")
    users = select(func.count()).select_from(User).where(User.tenant_id == Tenant.id).correlate(Tenant).scalar_subquery()
    branches = select(func.count()).select_from(Branch).where(Branch.tenant_id == Tenant.id).correlate(Tenant).scalar_subquery()
    stmt = select(Tenant, users.label("users"), branches.label("branches"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(Tenant.name.ilike(term) | Tenant.slug.ilike(term) | func.cast(Tenant.id, String).ilike(term))
    if status == "Archived":
        stmt = stmt.where(Tenant.archived_at.is_not(None))
    elif status == "Active":
        stmt = stmt.where(Tenant.archived_at.is_(None), Tenant.is_active.is_(True))
    elif status == "Suspended":
        stmt = stmt.where(Tenant.archived_at.is_(None), Tenant.is_active.is_(False))
    if plan:
        stmt = stmt.where(Tenant.subscription_plan == plan)
    if country:
        stmt = stmt.where(Tenant.country == country)
    total = (await db.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))).scalar_one()
    column = {"name": func.lower(Tenant.name), "plan": Tenant.subscription_plan, "country": Tenant.country, "users": users, "branches": branches, "created_at": Tenant.created_at,
              "status": Tenant.is_active}[sort]
    order = column.desc() if descending else column.asc()
    rows = (await db.execute(stmt.order_by(order, Tenant.id).offset(page.offset).limit(page.limit))).all()
    return paginated_response(items=[{"id": str(t.id), "name": t.name, "slug": t.slug, "logo_url": t.logo_url, "status": _status_of(t), "subscription": t.subscription_status, "plan": t.subscription_plan,
                                      "country": t.country, "users": u, "branches": br, "created_at": t.created_at} for t, u, br in rows],
                              total=total, page=page.page, page_size=page.page_size, message="Businesses retrieved")


@router.get("/businesses/{tenant_id}/day-activity")
async def day_activity(tenant_id: uuid.UUID, admin: SuperUser, db: DbSession, day: date = Query(alias="date")):
    """What the business recorded on one calendar day (in its own time zone), module by module: the starting point of Reset Business Day."""
    perms.require(admin, perms.VIEW)
    tenant = await explorer.tenant_of(db, tenant_id)
    out = []
    for m in MODULES.values():
        if not m.dates:
            continue
        date_type = "transaction" if "transaction" in m.dates else next(iter(m.dates))
        filters = {"date_type": date_type, "preset": "custom", "from": day.isoformat(), "to": day.isoformat()}
        data = await explorer.list_records(db, tenant, m.key, filters, page=1, page_size=1, sort=None, descending=True)
        out.append({"module": m.key, "label": m.label, "group": m.group, "date_type": date_type, "date_label": m.dates[date_type][1], "count": data["total"],
                    "archive": m.cap("archive").supported, "delete": m.cap("delete").supported})
    return success_response(data={"date": day.isoformat(), "timezone": tenant.timezone, "modules": out}, message="Day activity retrieved")


@router.get("/businesses/{tenant_id}")
async def business(tenant_id: uuid.UUID, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    t = await explorer.tenant_of(db, tenant_id)
    return success_response(data={"id": str(t.id), "name": t.name, "slug": t.slug, "logo_url": t.logo_url, "status": "Active" if t.is_active else "Suspended", "subscription": t.subscription_status,
                                  "timezone": t.timezone, "currency": t.currency}, message="Business retrieved")


@router.get("/businesses/{tenant_id}/modules")
async def modules(tenant_id: uuid.UUID, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    await explorer.tenant_of(db, tenant_id)
    return success_response(data=await explorer.module_counts(db, tenant_id), message="Modules retrieved")


@router.get("/modules/{module}")
async def module_description(module: str, admin: SuperUser):
    perms.require(admin, perms.VIEW)
    return success_response(data=explorer.describe(explorer.spec_for(module)), message="Module retrieved")


@router.get("/businesses/{tenant_id}/modules/{module}/filter-options")
async def filter_options(tenant_id: uuid.UUID, module: str, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    tenant = await explorer.tenant_of(db, tenant_id)
    return success_response(data=await explorer.filter_options(db, tenant, module), message="Filter options retrieved")


@router.post("/businesses/{tenant_id}/modules/{module}/records")
async def records(tenant_id: uuid.UUID, module: str, body: Query_, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    tenant = await explorer.tenant_of(db, tenant_id)
    data = await explorer.list_records(db, tenant, module, body.filters, page=body.page, page_size=body.page_size, sort=body.sort, descending=body.descending)
    return success_response(data=data, message="Records retrieved")


@router.get("/businesses/{tenant_id}/modules/{module}/records/{record_id}")
async def record(tenant_id: uuid.UUID, module: str, record_id: uuid.UUID, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    tenant = await explorer.tenant_of(db, tenant_id)
    return success_response(data=await explorer.record_detail(db, tenant, module, record_id), message="Record retrieved")


@router.post("/businesses/{tenant_id}/operations")
async def prepare(tenant_id: uuid.UUID, body: Prepare, admin: SuperUser, db: DbSession):
    """Stage A: work out exactly what the operation would do. Changes nothing."""
    data = await plans.prepare(db, admin, tenant_id, body.module, body.operation, body.selection, body.payload)
    return success_response(data=data, message="Preview ready", status_code=201)


@router.get("/requests", dependencies=[Depends(_require_request_queue_access)])
async def business_requests(admin: SuperUser, db: DbSession, page: PageQuery, tenant_id: uuid.UUID | None = None, module: str | None = Query(None, max_length=30),
                            from_date: date | None = None, to_date: date | None = None):
    if not (perms.has(admin, perms.PREVIEW) or perms.has(admin, perms.APPROVE)):
        raise ForbiddenError("Data Management permission required")
    stmt = select(DataManagementRequest).where(
        DataManagementRequest.status == "Submitted",
        DataManagementRequest.operation_id.is_(None),
    )
    if tenant_id:
        stmt = stmt.where(DataManagementRequest.tenant_id == tenant_id)
    if module:
        stmt = stmt.where(DataManagementRequest.module == module)
    if from_date:
        stmt = stmt.where(func.date(DataManagementRequest.created_at) >= from_date)
    if to_date:
        stmt = stmt.where(func.date(DataManagementRequest.created_at) <= to_date)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(
        stmt.order_by(DataManagementRequest.created_at.asc()).offset(page.offset).limit(page.limit)
    )).scalars().all()
    from app.modules.tenants.models import Tenant

    tenant_ids = {row.tenant_id for row in rows}
    tenants = {}
    if tenant_ids:
        tenants = dict((await db.execute(select(Tenant.id, Tenant.name).where(Tenant.id.in_(tenant_ids)))).all())
    return paginated_response(
        items=[{
            "id": str(row.id),
            "tenant_id": str(row.tenant_id),
            "tenant_name": tenants.get(row.tenant_id, "Unknown business"),
            "module": row.module,
            "filters": row.filters,
            "reason": row.reason,
            "requested_by": row.requested_by_name,
            "created_at": row.created_at,
        } for row in rows],
        total=total or 0,
        page=page.page,
        page_size=page.page_size,
        message="Business requests retrieved",
    )


async def _prepare_request_row(db, admin, request: DataManagementRequest) -> dict:
    """Turns one owner request into a delete-eligibility preview. Changes no business records; the caller commits."""
    plan = await plans.prepare(db, admin, request.tenant_id, request.module, "delete", {"mode": "matching", "filters": request.filters}, {}, commit=False)
    request.operation_id = uuid.UUID(plan["id"])
    request.reviewed_by = admin.id
    await record_audit(
        db, tenant_id=request.tenant_id, actor_user_id=admin.id, actor_name=f"{admin.full_name} (platform)", action="data_management.request_reviewed",
        entity_type="data_management_request", entity_id=str(request.id), summary=f"Prepared a deletion eligibility preview for {request.module}",
        changes={"operation_id": plan["id"], "eligible": plan["summary"].get("eligible", 0), "selected": plan["summary"].get("selected", 0)},
    )
    return plan


async def _decline_request_row(db, admin, request: DataManagementRequest, note: str) -> None:
    request.status = "Declined"
    request.reviewed_by = admin.id
    request.review_note = note
    await record_audit(
        db, tenant_id=request.tenant_id, actor_user_id=admin.id, actor_name=f"{admin.full_name} (platform)", action="data_management.request_declined",
        entity_type="data_management_request", entity_id=str(request.id), summary=f"Declined data removal request for {request.module}", changes={"note": note},
    )


async def _open_request(db, request_id: uuid.UUID) -> DataManagementRequest:
    request = (await db.execute(select(DataManagementRequest).where(
        DataManagementRequest.id == request_id, DataManagementRequest.status == "Submitted", DataManagementRequest.operation_id.is_(None)).with_for_update())).scalar_one_or_none()
    if request is None:
        raise ConflictError("This business request was not found or has already been reviewed")
    return request


@router.post("/requests/{request_id}/prepare", dependencies=[Depends(_require_data_preview)])
async def prepare_business_request(request_id: uuid.UUID, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.PREVIEW)
    request = await _open_request(db, request_id)
    plan = await _prepare_request_row(db, admin, request)
    await db.commit()
    return success_response(data={"request_id": str(request.id), "operation": plan}, message="Eligibility preview prepared", status_code=201)


@router.post("/requests/{request_id}/reject", dependencies=[Depends(_require_data_approval)])
async def reject_business_request(request_id: uuid.UUID, body: RejectRequest, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.APPROVE)
    note = body.note.strip()
    if len(note) < 3:
        raise ValidationError("The decline note must be at least 3 characters")
    request = await _open_request(db, request_id)
    await _decline_request_row(db, admin, request, note)
    await db.commit()
    return success_response(data={"id": str(request.id), "status": request.status, "review_note": request.review_note}, message="Business request declined")


@router.get("/operations")
async def operations(admin: SuperUser, db: DbSession, page: PageQuery, tenant_id: uuid.UUID | None = None, module: str | None = None, operation: str | None = None,
                     status: str | None = None, requested_by: uuid.UUID | None = None, from_date: date | None = None, to_date: date | None = None, include_drafts: bool = False):
    perms.require(admin, perms.HISTORY)
    items, total = await plans.history(db, tenant_id=tenant_id, module=module, operation=operation, status=status, requested_by=requested_by, start=from_date, end=to_date,
                                       include_drafts=include_drafts, offset=page.offset, limit=page.limit)
    return paginated_response(items=items, total=total, page=page.page, page_size=page.page_size, message="Operations retrieved")


@router.get("/operations/{op_id}")
async def operation(op_id: uuid.UUID, admin: SuperUser, db: DbSession):
    # A plan can be opened by the people who prepare, approve or execute it, and by anyone who may read the history.
    if not (perms.has(admin, perms.HISTORY) or perms.has(admin, perms.PREVIEW) or perms.has(admin, perms.APPROVE) or perms.has(admin, perms.EXECUTE)):
        raise ForbiddenError("Data Management permission required")
    return success_response(data=await plans.get(db, op_id), message="Operation retrieved")


@router.get("/operations/{op_id}/items")
async def operation_items(op_id: uuid.UUID, admin: SuperUser, db: DbSession, page: PageQuery, outcome: str | None = Query(None, pattern="^(affected|blocked|failed|skipped)$")):
    perms.require(admin, perms.HISTORY)
    rows, total = await plans.items(db, op_id, outcome, page.offset, page.limit)
    return paginated_response(items=rows, total=total, page=page.page, page_size=page.page_size, message="Results retrieved")


@router.post("/operations/{op_id}/submit")
async def submit(op_id: uuid.UUID, body: Submit, admin: SuperUser, db: DbSession):
    return success_response(data=await plans.submit(db, admin, op_id, body.reason, body.attest_test_data), message="Submitted")


@router.post("/operations/{op_id}/decision")
async def decision(op_id: uuid.UUID, body: Decision, admin: SuperUser, db: DbSession):
    return success_response(data=await plans.decide(db, admin, op_id, body.approve, body.note), message="Decision recorded")


@router.post("/operations/{op_id}/execute")
async def execute(op_id: uuid.UUID, body: Execute, admin: SuperUser, db: DbSession):
    """Stage B: re-check everything and run. Running an operation that already ran returns its result and does nothing more."""
    return success_response(data=await plans.execute(db, admin, op_id, body.idempotency_key, body.confirm), message="Operation finished")


@router.post("/operations/approve-and-run-batch")
async def approve_and_run_batch(body: ApproveAndRunBatch, admin: SuperUser, db: DbSession):
    results = await plans.approve_and_run_batch(db, admin, body.ids, body.phrase)
    return success_response(data={"results": results}, message="Batch finished")


@router.post("/operations/{op_id}/approve-and-run")
async def approve_and_run(op_id: uuid.UUID, body: ApproveAndRun, admin: SuperUser, db: DbSession):
    """Submit, approve and run in one step for the requester, while the platform allows self-approval. Everything is checked again before it runs."""
    return success_response(data=await plans.approve_and_run(db, admin, op_id, reason=body.reason, attest_test_data=body.attest_test_data, idempotency_key=body.idempotency_key, confirm=body.confirm),
                            message="Operation finished")


@router.post("/operations/{op_id}/cancel")
async def cancel(op_id: uuid.UUID, admin: SuperUser, db: DbSession):
    return success_response(data=await plans.cancel(db, admin, op_id), message="Cancelled")


@router.get("/saved-filters")
async def saved_filters(admin: SuperUser, db: DbSession, module: str | None = None):
    perms.require(admin, perms.VIEW)
    stmt = select(DataSavedFilter).where(DataSavedFilter.admin_id == admin.id).order_by(DataSavedFilter.name)
    if module:
        stmt = stmt.where(DataSavedFilter.module == module)
    return success_response(data=[{"id": str(f.id), "module": f.module, "name": f.name, "tenant_id": str(f.tenant_id) if f.tenant_id else None, "filters": f.filters}
                                  for f in (await db.execute(stmt)).scalars()], message="Saved filters retrieved")


@router.post("/saved-filters")
async def save_filter(body: SaveFilter, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    explorer.spec_for(body.module)
    row = DataSavedFilter(admin_id=admin.id, tenant_id=body.tenant_id, module=body.module, name=body.name.strip(), filters=body.filters)
    db.add(row)
    await db.commit()
    return success_response(data={"id": str(row.id)}, message="Filter saved", status_code=201)


@router.delete("/saved-filters/{filter_id}")
async def delete_filter(filter_id: uuid.UUID, admin: SuperUser, db: DbSession):
    perms.require(admin, perms.VIEW)
    row = await db.get(DataSavedFilter, filter_id)
    if row is None or row.admin_id != admin.id:
        raise NotFoundError("Saved filter not found")
    await db.delete(row)
    await db.commit()
    return success_response(message="Filter deleted")


@router.get("/businesses/{tenant_id}/recovery")
async def recovery(tenant_id: uuid.UUID, admin: SuperUser, db: DbSession):
    """What can really be recovered. There is no backup system in this platform, so this says so rather than listing restore points that do not exist."""
    perms.require(admin, perms.RECOVERY)
    await explorer.tenant_of(db, tenant_id)
    exports = (await db.execute(select(TenantExport).where(TenantExport.tenant_id == tenant_id).order_by(TenantExport.created_at.desc()).limit(20))).scalars().all()
    with_snapshots = (await db.execute(select(DataOperation.id, DataOperation.reference, DataOperation.module, DataOperation.operation, DataOperation.finished_at, DataOperation.affected_count)
                                       .where(DataOperation.tenant_id == tenant_id, DataOperation.operation.in_(["delete", "clean_test"]), DataOperation.affected_count > 0)
                                       .order_by(DataOperation.finished_at.desc()).limit(20))).all()
    return success_response(data={
        "backups": [], "backup_system": {"configured": False, "message": "No backup or point-in-time recovery system is configured for this platform, so there are no restore points to show. Restoring one business from a whole-database backup is not supported either, because businesses share one database."},
        "exports": [{"id": str(e.id), "created_at": e.created_at, "format": e.fmt, "categories": e.categories, "expires_at": e.expires_at, "note": "A data export for the business. The file is built when downloaded and is not stored, so it is not a restore point."} for e in exports],
        "deletion_records": [{"operation_id": str(o.id), "reference": o.reference, "module": o.module, "operation": o.operation, "finished_at": o.finished_at, "records": o.affected_count,
                              "note": "Key fields of each removed record are kept in the operation history for reference. They cannot be restored automatically."} for o in with_snapshots],
        "recovery_available_for": {"archive": "Reversible by the business: archived records can be restored.", "delete": "Not reversible.", "clean_test": "Not reversible.", "correct": "The previous values are kept in the audit trail and can be corrected back.", "reset": "The period can be reopened with a reason."},
    }, message="Recovery information retrieved")
