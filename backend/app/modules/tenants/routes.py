import uuid

from fastapi import APIRouter, UploadFile

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.integrations.storage import storage
from app.modules.tenants import service
from app.modules.tenants.schemas import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    ShopCreate,
    ShopRead,
    ShopUpdate,
    TenantCreate,
    TenantRead,
    TenantUpdate,
)

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/departments")
async def list_departments(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    departments = await service.list_departments(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_departments(db, current_user.tenant_id)
    return paginated_response(
        items=[DepartmentRead.model_validate(d).model_dump() for d in departments],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Departments retrieved successfully",
    )


@router.post("/departments")
async def create_department(data: DepartmentCreate, db: DbSession, current_user: CurrentUser):
    dept = await service.create_department(db, current_user.tenant_id, data)
    return success_response(
        data=DepartmentRead.model_validate(dept).model_dump(),
        message="Department created successfully",
        status_code=201,
    )


@router.get("/departments/{dept_id}")
async def get_department(dept_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    dept = await service.get_department(db, current_user.tenant_id, dept_id)
    return success_response(
        data=DepartmentRead.model_validate(dept).model_dump(),
        message="Department retrieved successfully",
    )


@router.patch("/departments/{dept_id}")
async def update_department(
    dept_id: uuid.UUID, data: DepartmentUpdate, db: DbSession, current_user: CurrentUser
):
    dept = await service.get_department(db, current_user.tenant_id, dept_id)
    dept = await service.update_department(db, dept, data)
    return success_response(
        data=DepartmentRead.model_validate(dept).model_dump(),
        message="Department updated successfully",
    )


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    dept = await service.get_department(db, current_user.tenant_id, dept_id)
    await service.delete_department(db, dept)
    return success_response(message="Department deleted successfully")


@router.get("/shops")
async def list_shops(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    shops = await service.list_shops(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_shops(db, current_user.tenant_id)
    return paginated_response(
        items=[ShopRead.model_validate(s).model_dump() for s in shops],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Shops retrieved successfully",
    )


@router.post("/shops")
async def create_shop(data: ShopCreate, db: DbSession, current_user: CurrentUser):
    shop = await service.create_shop(db, current_user.tenant_id, data)
    return success_response(
        data=ShopRead.model_validate(shop).model_dump(),
        message="Shop created successfully",
        status_code=201,
    )


@router.get("/shops/{shop_id}")
async def get_shop(shop_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    shop = await service.get_shop(db, current_user.tenant_id, shop_id)
    return success_response(
        data=ShopRead.model_validate(shop).model_dump(),
        message="Shop retrieved successfully",
    )


@router.patch("/shops/{shop_id}")
async def update_shop(
    shop_id: uuid.UUID, data: ShopUpdate, db: DbSession, current_user: CurrentUser
):
    shop = await service.get_shop(db, current_user.tenant_id, shop_id)
    shop = await service.update_shop(db, shop, data)
    return success_response(
        data=ShopRead.model_validate(shop).model_dump(),
        message="Shop updated successfully",
    )


@router.delete("/shops/{shop_id}")
async def delete_shop(shop_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    shop = await service.get_shop(db, current_user.tenant_id, shop_id)
    await service.delete_shop(db, shop)
    return success_response(message="Shop deleted successfully")


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


@router.post("/{tenant_id}/logo")
async def upload_logo(tenant_id: uuid.UUID, file: UploadFile, db: DbSession, current_user: CurrentUser):
    content = await file.read()
    url = await storage.save("logos", file.filename or "logo.png", content)
    tenant = await service.get_by_id(db, tenant_id)
    tenant.logo_url = url
    await service.update(db, tenant, TenantUpdate(logo_url=url))
    return success_response(data={"logo_url": url}, message="Logo uploaded successfully")
