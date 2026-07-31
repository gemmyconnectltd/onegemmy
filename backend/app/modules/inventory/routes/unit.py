import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import UnitCreate, UnitUpdate

router = APIRouter(tags=["Inventory - Units"])


@router.get("/inventory/units")
async def list_units(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_units(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_units(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Units retrieved successfully")


@router.post("/inventory/units")
async def create_unit(data: UnitCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_unit(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Unit created successfully", status_code=201)


@router.get("/inventory/units/{id}")
async def get_unit(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_unit(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Unit retrieved successfully")


@router.patch("/inventory/units/{id}")
async def update_unit(id: uuid.UUID, data: UnitUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_unit(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Unit updated successfully")


@router.delete("/inventory/units/{id}")
async def delete_unit(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_unit(db, current_user.tenant_id, id)
    return success_response(message="Unit deleted successfully")
