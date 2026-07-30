import uuid

from fastapi import APIRouter

from app.core.deps import DbSession, SuperUser
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import TenantUpdate

router = APIRouter(prefix="/admin", tags=["Super Admin"])


@router.get("/tenants")
async def admin_list_tenants(
    db: DbSession,
    _: SuperUser,
    page_params: PageQuery,
):
    tenants = await service.list_all(db, page_params.offset, page_params.limit)
    total = await service.count_all(db)
    return paginated_response(
        items=[t.model_dump() for t in tenants],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="All tenants retrieved successfully",
    )


@router.get("/tenants/{tenant_id}")
async def admin_get_tenant(
    tenant_id: uuid.UUID,
    db: DbSession,
    _: SuperUser,
):
    tenant = await service.get_by_id(db, tenant_id)
    return success_response(data=tenant.model_dump(), message="Tenant retrieved successfully")


@router.patch("/tenants/{tenant_id}")
async def admin_update_tenant(
    tenant_id: uuid.UUID,
    data: TenantUpdate,
    db: DbSession,
    _: SuperUser,
):
    tenant = await service.update_tenant(db, tenant_id, data)
    return success_response(data=tenant.model_dump(), message="Tenant updated successfully")


@router.delete("/tenants/{tenant_id}")
async def admin_delete_tenant(
    tenant_id: uuid.UUID,
    db: DbSession,
    _: SuperUser,
):
    await service.delete_tenant(db, tenant_id)
    return success_response(message="Tenant deleted successfully")


@router.get("/tenants/{tenant_id}/users")
async def admin_list_tenant_users(
    tenant_id: uuid.UUID,
    db: DbSession,
    _: SuperUser,
    page_params: PageQuery,
):
    users = await service.list_users(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_users(db, tenant_id)
    return paginated_response(
        items=[u.model_dump() for u in users],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Tenant users retrieved successfully",
    )


@router.get("/tenants/{tenant_id}/branches")
async def admin_list_tenant_branches(
    tenant_id: uuid.UUID,
    db: DbSession,
    _: SuperUser,
    page_params: PageQuery,
):
    branches = await service.list_branches(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_branches(db, tenant_id)
    return paginated_response(
        items=[b.model_dump() for b in branches],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Tenant branches retrieved successfully",
    )


@router.get("/tenants/{tenant_id}/departments")
async def admin_list_tenant_departments(
    tenant_id: uuid.UUID,
    db: DbSession,
    _: SuperUser,
    page_params: PageQuery,
):
    departments = await service.list_departments(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_departments(db, tenant_id)
    return paginated_response(
        items=[d.model_dump() for d in departments],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Tenant departments retrieved successfully",
    )


@router.get("/tenants/{tenant_id}/roles")
async def admin_list_tenant_roles(
    tenant_id: uuid.UUID,
    db: DbSession,
    _: SuperUser,
    page_params: PageQuery,
):
    roles = await service.list_roles(db, tenant_id, page_params.offset, page_params.limit)
    total = await service.count_roles(db, tenant_id)
    return paginated_response(
        items=[r.model_dump() for r in roles],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Tenant roles retrieved successfully",
    )
