import uuid

from fastapi import APIRouter, UploadFile

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response
from app.core.response import success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import TenantCreate, TenantUpdate

router = APIRouter(tags=["Tenants"])


@router.get("/")
async def list_tenants(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    tenants = await service.list_all(db, page_params.offset, page_params.limit)
    total = await service.count_all(db)
    return paginated_response(
        items=[t.model_dump() for t in tenants],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Companies retrieved successfully",
    )


@router.post("/")
async def create_tenant(data: TenantCreate, db: DbSession, current_user: CurrentUser):
    tenant = await service.create_tenant(db, data)
    return success_response(
        data=tenant.model_dump(),
        message="Company created successfully",
        status_code=201,
    )


@router.get("/me/current")
async def get_current_tenant(db: DbSession, current_user: CurrentUser):
    tenant = await service.get_by_id(db, current_user.tenant_id)
    return success_response(
        data=tenant.model_dump(),
        message="Current company retrieved successfully",
    )


@router.get("/{tenant_id}")
async def get_tenant(tenant_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant = await service.get_by_id(db, tenant_id)
    return success_response(
        data=tenant.model_dump(),
        message="Company retrieved successfully",
    )


@router.patch("/{tenant_id}")
async def update_tenant(
    tenant_id: uuid.UUID, data: TenantUpdate, db: DbSession, current_user: CurrentUser
):
    tenant = await service.update_tenant(db, tenant_id, data)
    return success_response(
        data=tenant.model_dump(),
        message="Company updated successfully",
    )


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_tenant(db, tenant_id)
    return success_response(message="Company deleted successfully")


@router.post("/{tenant_id}/logo")
async def upload_logo(tenant_id: uuid.UUID, file: UploadFile, db: DbSession, current_user: CurrentUser):
    content = await file.read()
    url = await service.upload_logo(db, tenant_id, file.filename or "logo.png", content)
    return success_response(data={"logo_url": url}, message="Logo uploaded successfully")
