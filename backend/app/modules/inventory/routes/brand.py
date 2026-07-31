import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import BrandCreate, BrandUpdate

router = APIRouter(tags=["Inventory - Brands"])


@router.get("/inventory/brands")
async def list_brands(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_brands(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_brands(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Brands retrieved successfully")


@router.post("/inventory/brands")
async def create_brand(data: BrandCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_brand(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Brand created successfully", status_code=201)


@router.get("/inventory/brands/{id}")
async def get_brand(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_brand(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Brand retrieved successfully")


@router.patch("/inventory/brands/{id}")
async def update_brand(id: uuid.UUID, data: BrandUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_brand(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Brand updated successfully")


@router.delete("/inventory/brands/{id}")
async def delete_brand(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_brand(db, current_user.tenant_id, id)
    return success_response(message="Brand deleted successfully")
