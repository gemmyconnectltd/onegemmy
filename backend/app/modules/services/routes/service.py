import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.services import service
from app.modules.services.schemas import ServiceCreate, ServiceImportRequest, ServiceUpdate

router = APIRouter(tags=["Services - Catalog"])


@router.get("/services/catalog")
async def list_services(
    db: DbSession, current_user: CurrentUser, page_params: PageQuery,
    search: str | None = None, category_id: uuid.UUID | None = None, is_active: bool | None = None,
):
    items = await service.list_services(
        db, current_user.tenant_id, page_params.offset, page_params.limit, search, category_id, is_active,
    )
    total = await service.count_services(db, current_user.tenant_id, search, category_id, is_active)
    return paginated_response(
        items=[i.model_dump() for i in items], total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="Services retrieved successfully",
    )


# Declared before "/services/catalog/{id}" — otherwise FastAPI would try to
# parse "all"/"templates"/"import" as that route's UUID path param first.
@router.get("/services/catalog/all")
async def list_all_services(db: DbSession, current_user: CurrentUser):
    items = await service.list_all_services(db, current_user.tenant_id)
    return success_response(data=[i.model_dump() for i in items], message="Services retrieved successfully")


@router.get("/services/catalog/templates")
async def get_service_templates(db: DbSession, current_user: CurrentUser):
    result = await service.get_service_templates(db, current_user.tenant_id)
    return success_response(data=result.model_dump(), message="Service templates retrieved successfully")


@router.post("/services/catalog/import")
async def import_services(data: ServiceImportRequest, db: DbSession, current_user: CurrentUser):
    result = await service.import_services(db, current_user.tenant_id, data.items)
    return success_response(data=result.model_dump(), message="Services imported successfully")


@router.post("/services/catalog")
async def create_service(data: ServiceCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_service(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Service created successfully", status_code=201)


@router.get("/services/catalog/{id}")
async def get_service(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_service(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Service retrieved successfully")


@router.patch("/services/catalog/{id}")
async def update_service(id: uuid.UUID, data: ServiceUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_service(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Service updated successfully")


@router.delete("/services/catalog/{id}")
async def delete_service(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_service(db, current_user.tenant_id, id)
    return success_response(message="Service deleted successfully")
