import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.crm import service
from app.modules.crm.schemas import CampaignCreate, CampaignUpdate

router = APIRouter(tags=["CRM - Campaigns"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/crm/campaigns")
async def list_campaigns(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    _require_tenant(current_user.tenant_id)
    items = await service.list_campaigns(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_campaigns(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Campaigns retrieved successfully")


@router.post("/crm/campaigns")
async def create_campaign(data: CampaignCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_campaign(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Campaign created successfully", status_code=201)


@router.get("/crm/campaigns/{id}")
async def get_campaign(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_campaign(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Campaign retrieved successfully")


@router.patch("/crm/campaigns/{id}")
async def update_campaign(id: uuid.UUID, data: CampaignUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_campaign(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Campaign updated successfully")


@router.delete("/crm/campaigns/{id}")
async def delete_campaign(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_campaign(db, current_user.tenant_id, id)
    return success_response(message="Campaign deleted successfully")
