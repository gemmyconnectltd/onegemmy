import uuid

from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.audit.service import record_audit
from app.modules.tenants import service
from app.modules.tenants.schemas import TenantCreate, TenantUpdate

router = APIRouter(tags=["Tenants"])

MAX_LOGO_BYTES = 2 * 1024 * 1024
# SVG excluded: it can embed <script>, and uploads are served back as static
# files, so allowing it would let a tenant admin plant stored XSS on our origin.
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp"}


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


async def _platform_admin_only(current_user: CurrentUser) -> None:
    if current_user.tenant_id is not None or not current_user.is_superuser:
        raise ForbiddenError("Creating a company requires platform administration")


@router.post("/", dependencies=[Depends(_platform_admin_only)])
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
        features, limits, modules = {}, {}, {}
    else:
        modules = await service.resolve_modules(db, current_user.tenant_id)
        features = {k: v == "enabled" for k, v in modules.items()}
        limits_data = await service.get_tenant_limits(db, current_user.tenant_id)
        limits = limits_data.model_dump()
    return success_response(
        data={"features": features, "modules": modules, "limits": limits},
        message="Current company entitlements retrieved successfully",
    )


class ModuleActivation(BaseModel):
    enabled: bool


@router.get("/me/modules")
async def get_my_modules(db: DbSession, current_user: CurrentUser):
    """The plan and every module's state for the signed-in business (see service.resolve_modules)."""
    if current_user.tenant_id is None:
        raise ForbiddenError("Modules belong to a business account")
    return success_response(data=await service.my_modules(db, current_user.tenant_id), message="Modules retrieved")


@router.patch("/me/modules/{key}", dependencies=[Depends(require_permission("tenants:update"))])
async def set_my_module(key: str, data: ModuleActivation, db: DbSession, current_user: CurrentUser):
    """The business administrator turns a module their plan includes on or off. Data is never deleted."""
    if current_user.tenant_id is None:
        raise ForbiddenError("Modules belong to a business account")
    result = await service.set_module_activation(db, current_user.tenant_id, key, data.enabled)
    await record_audit(
        db, tenant_id=current_user.tenant_id, actor_user_id=current_user.id,
        actor_name=current_user.full_name or current_user.email,
        action="tenant.module.enable" if data.enabled else "tenant.module.disable", entity_type="module", entity_id=key,
        summary=f"Module {key} turned {'on' if data.enabled else 'off'}", changes={"enabled": data.enabled},
    )
    await db.commit()
    return success_response(data=result, message="Module updated")


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
    if {"subscription_plan", "subscription_status", "is_active"} & data.model_fields_set:
        raise ForbiddenError("Subscription and activation changes require platform administration")
    # The daily credit limit is the General Manager/CEO's call: only someone holding credit:approve (or the
    # platform superuser) may set or clear it. Everything else in this PATCH keeps its existing rules.
    if "credit_daily_limit" in data.model_fields_set and not (
        current_user.is_superuser or "credit:approve" in current_user.permissions_names
    ):
        raise ForbiddenError("Permission required: credit:approve")
    if data.model_fields_set - {"credit_daily_limit"}:
        await require_permission("tenants:update")(current_user)
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


@router.post("/{tenant_id}/logo", dependencies=[Depends(require_permission("tenants:update"))])
async def upload_logo(tenant_id: uuid.UUID, file: UploadFile, db: DbSession, current_user: CurrentUser):
    _require_own_tenant(current_user, tenant_id)
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise ValidationError("Logo must be a PNG, JPEG or WEBP image")
    content = await file.read()
    if len(content) > MAX_LOGO_BYTES:
        raise ValidationError("Logo must be smaller than 2MB")
    url = await service.upload_logo(db, tenant_id, file.filename or "logo.png", content)
    return success_response(data={"logo_url": url}, message="Logo uploaded successfully")
