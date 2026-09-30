import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.services import service
from app.modules.services.schemas import ServiceCategoryCreate, ServiceCategoryUpdate

router = APIRouter(tags=["Services - Categories"])


@router.get("/services/categories")
async def list_service_categories(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_service_categories(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_service_categories(db, current_user.tenant_id)
    return paginated_response(
        items=[i.model_dump() for i in items], total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="Service categories retrieved successfully",
    )


@router.post("/services/categories")
async def create_service_category(data: ServiceCategoryCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_service_category(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Service category created successfully", status_code=201)


@router.get("/services/categories/{id}")
async def get_service_category(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_service_category(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Service category retrieved successfully")


@router.patch("/services/categories/{id}")
async def update_service_category(id: uuid.UUID, data: ServiceCategoryUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_service_category(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Service category updated successfully")


@router.delete("/services/categories/{id}")
async def delete_service_category(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_service_category(db, current_user.tenant_id, id)
    return success_response(message="Service category deleted successfully")
