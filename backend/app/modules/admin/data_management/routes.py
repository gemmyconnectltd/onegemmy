import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import DbSession, SuperUser
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.admin.data_management import explorer, plans
from app.modules.admin.data_management import permissions as perms
from app.modules.admin.data_management.models import DataOperation, DataSavedFilter
from app.modules.admin.data_management.registry import MODULES, OP_LABEL
from app.modules.admin.models import TenantExport

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


class SaveFilter(BaseModel):
    module: str
    name: str = Field(min_length=1, max_length=100)
    tenant_id: uuid.UUID | None = None
    filters: dict[str, Any]


@router.get("/me")
async def my_permissions(admin: SuperUser):
    return success_response(data={"id": str(admin.id), "permissions": perms.granted(admin), "labels": perms.LABELS, "all": list(perms.ALL)}, message="Permissions retrieved")


@router.get("/meta")
async def meta(admin: SuperUser):
    perms.require(admin, perms.VIEW)
    return success_response(data={"operations": OP_LABEL, "modules": [{"key": m.key, "label": m.label, "group": m.group} for m in MODULES.values()]}, message="Data Management retrieved")


@router.get("/businesses")
async def businesses(admin: SuperUser, db: DbSession, page: PageQuery, search: str | None = Query(None, max_length=100)):
    """Businesses to choose from: just enough to pick one. Nothing about its records is shown until it is chosen."""
    perms.require(admin, perms.VIEW)
    from app.modules.tenants.models import Tenant
    stmt = select(Tenant.id, Tenant.name, Tenant.slug, Tenant.logo_url, Tenant.is_active, Tenant.subscription_status)
    if search:
        stmt = stmt.where(Tenant.name.ilike(f"%{search}%") | Tenant.slug.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Tenant.name).offset(page.offset).limit(page.limit))).all()
    return paginated_response(items=[{"id": str(r.id), "name": r.name, "slug": r.slug, "logo_url": r.logo_url, "status": "Active" if r.is_active else "Suspended", "subscription": r.subscription_status} for r in rows],
                              total=total, page=page.page, page_size=page.page_size, message="Businesses retrieved")


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
