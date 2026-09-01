import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.manufacturing import service
from app.modules.manufacturing.schemas import BomCreate, BomUpdate

router = APIRouter(tags=["Manufacturing - Bill of Materials"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/manufacturing/boms")
async def list_boms(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    _require_tenant(current_user.tenant_id)
    items = await service.list_boms(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_boms(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Bills of materials retrieved successfully")


@router.post("/manufacturing/boms")
async def create_bom(data: BomCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_bom(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Bill of materials created successfully", status_code=201)


@router.get("/manufacturing/boms/{id}")
async def get_bom(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_bom(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Bill of materials retrieved successfully")


@router.patch("/manufacturing/boms/{id}")
async def update_bom(id: uuid.UUID, data: BomUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_bom(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Bill of materials updated successfully")


@router.delete("/manufacturing/boms/{id}")
async def delete_bom(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_bom(db, current_user.tenant_id, id)
    return success_response(message="Bill of materials deleted successfully")
