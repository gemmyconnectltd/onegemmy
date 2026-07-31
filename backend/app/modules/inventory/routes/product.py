import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import ProductCreate, ProductUpdate

router = APIRouter(tags=["Inventory - Products"])


@router.get("/inventory/products")
async def list_products(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_products(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_products(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Products retrieved successfully")


@router.post("/inventory/products")
async def create_product(data: ProductCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_product(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Product created successfully", status_code=201)


@router.get("/inventory/products/{id}")
async def get_product(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_product(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Product retrieved successfully")


@router.patch("/inventory/products/{id}")
async def update_product(id: uuid.UUID, data: ProductUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_product(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Product updated successfully")


@router.delete("/inventory/products/{id}")
async def delete_product(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_product(db, current_user.tenant_id, id)
    return success_response(message="Product deleted successfully")
