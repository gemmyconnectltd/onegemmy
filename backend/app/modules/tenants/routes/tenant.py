import uuid

from fastapi import APIRouter, UploadFile

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import TenantCreate, TenantUpdate

router = APIRouter(tags=["Tenants"])


def _require_own_tenant(current_user, tenant_id: uuid.UUID) -> None:
    """Tenant admins may only manage their own company. Hides existence."""
    if current_user.tenant_id is None or current_user.tenant_id != tenant_id:
        raise NotFoundError("Company not found")


@router.get("/")
async def list_tenants(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    if current_user.tenant_id is None:
        tenants, total = [], 0
    else:
        tenant = await service.get_by_id(db, current_user.tenant_id)
        tenants = [tenant.model_dump()] if tenant else []
        total = len(tenants)
    return paginated_response(
        items=tenants,
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


@router.get("/me/entitlements")
async def get_current_tenant_entitlements(db: DbSession, current_user: CurrentUser):
    """Effective feature flags + usage limits for the current tenant."""
    if current_user.tenant_id is None:
        features, limits = {}, {}
    else:
        features = await service.get_effective_features(db, current_user.tenant_id)
        limits_data = await service.get_tenant_limits(db, current_user.tenant_id)
        limits = limits_data.model_dump()
    return success_response(
        data={"features": features, "limits": limits},
        message="Current company entitlements retrieved successfully",
    )


@router.get("/{tenant_id}")
async def get_tenant(tenant_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_own_tenant(current_user, tenant_id)
    tenant = await service.get_by_id(db, tenant_id)
    return success_response(
        data=tenant.model_dump(),
        message="Company retrieved successfully",
    )


@router.patch("/{tenant_id}")
async def update_tenant(
    tenant_id: uuid.UUID, data: TenantUpdate, db: DbSession, current_user: CurrentUser
):
    _require_own_tenant(current_user, tenant_id)
    tenant = await service.update_tenant(db, tenant_id, data)
    return success_response(
        data=tenant.model_dump(),
        message="Company updated successfully",
    )


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_own_tenant(current_user, tenant_id)
    await service.delete_tenant(db, tenant_id)
    return success_response(message="Company deleted successfully")


@router.post("/{tenant_id}/logo")
async def upload_logo(tenant_id: uuid.UUID, file: UploadFile, db: DbSession, current_user: CurrentUser):
    _require_own_tenant(current_user, tenant_id)
    content = await file.read()
    url = await service.upload_logo(db, tenant_id, file.filename or "logo.png", content)
    return success_response(data={"logo_url": url}, message="Logo uploaded successfully")
