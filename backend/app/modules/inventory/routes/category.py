import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import CategoryCreate, CategoryImportRequest, CategoryUpdate

router = APIRouter(tags=["Inventory - Categories"])


@router.get("/inventory/categories")
async def list_categories(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_categories(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_categories(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Categories retrieved successfully")


# Declared before "/inventory/categories/{id}" — otherwise FastAPI would try
# to parse "templates"/"import" as that route's UUID path param first.
@router.get("/inventory/categories/templates")
async def get_category_templates(db: DbSession, current_user: CurrentUser):
    result = await service.get_category_templates(db, current_user.tenant_id)
    return success_response(data=result.model_dump(), message="Category templates retrieved successfully")


@router.post("/inventory/categories/import")
async def import_categories(data: CategoryImportRequest, db: DbSession, current_user: CurrentUser):
    result = await service.import_categories(db, current_user.tenant_id, data.names)
    return success_response(data=result.model_dump(), message="Categories imported successfully")


@router.post("/inventory/categories")
async def create_category(data: CategoryCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_category(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Category created successfully", status_code=201)


@router.get("/inventory/categories/{id}")
async def get_category(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_category(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Category retrieved successfully")


@router.patch("/inventory/categories/{id}")
async def update_category(id: uuid.UUID, data: CategoryUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_category(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Category updated successfully")


@router.delete("/inventory/categories/{id}")
async def delete_category(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_category(db, current_user.tenant_id, id)
    return success_response(message="Category deleted successfully")
