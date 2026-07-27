import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import TenantCreate, TenantRead, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("")
async def list_tenants(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    tenants = await service.list_all(db, params.offset, params.limit)
    total = await service.count_all(db)
    return paginated_response(
        items=[TenantRead.model_validate(t).model_dump() for t in tenants],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Companies retrieved successfully",
    )


@router.post("")
async def create_tenant(data: TenantCreate, db: DbSession, current_user: CurrentUser):
    tenant = await service.create_tenant(db, data)
    return success_response(
        data=TenantRead.model_validate(tenant).model_dump(),
        message="Company created successfully",
        status_code=201,
    )


@router.get("/me/current")
async def get_current_tenant(db: DbSession, current_user: CurrentUser):
    tenant = await service.get_by_id(db, current_user.tenant_id)
    return success_response(
        data=TenantRead.model_validate(tenant).model_dump(),
        message="Current company retrieved successfully",
    )


@router.get("/{tenant_id}")
async def get_tenant(tenant_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant = await service.get_by_id(db, tenant_id)
    return success_response(
        data=TenantRead.model_validate(tenant).model_dump(),
        message="Company retrieved successfully",
    )


@router.patch("/{tenant_id}")
async def update_tenant(
    tenant_id: uuid.UUID, data: TenantUpdate, db: DbSession, current_user: CurrentUser
):
    tenant = await service.get_by_id(db, tenant_id)
    tenant = await service.update(db, tenant, data)
    return success_response(
        data=TenantRead.model_validate(tenant).model_dump(),
        message="Company updated successfully",
    )


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant = await service.get_by_id(db, tenant_id)
    await service.delete(db, tenant)
    return success_response(message="Company deleted successfully")
