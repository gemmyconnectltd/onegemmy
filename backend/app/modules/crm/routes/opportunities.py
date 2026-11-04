import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service as sales_service
from app.modules.sales.schemas import DealCreate, DealUpdate

router = APIRouter(tags=["CRM - Opportunities"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/crm/opportunities")
async def list_opportunities(
    db: DbSession,
    current_user: CurrentUser,
    page_params: PageQuery,
    stage: str | None = Query(None, max_length=50),
    search: str | None = Query(None, max_length=100),
):
    _require_tenant(current_user.tenant_id)
    items = await sales_service.list_deals(
        db, current_user.tenant_id, stage, page_params.offset, page_params.limit, search
    )
    total = await sales_service.count_deals(db, current_user.tenant_id, stage, search)
    return paginated_response(
        items=[item.model_dump() for item in items],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Opportunities retrieved successfully",
    )


@router.post("/crm/opportunities")
async def create_opportunity(data: DealCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await sales_service.create_deal(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Opportunity created", status_code=201)


@router.get("/crm/opportunities/{opportunity_id}")
async def get_opportunity(
    opportunity_id: uuid.UUID, db: DbSession, current_user: CurrentUser
):
    _require_tenant(current_user.tenant_id)
    obj = await sales_service.get_deal(db, current_user.tenant_id, opportunity_id)
    return success_response(data=obj.model_dump(), message="Opportunity retrieved")


@router.patch("/crm/opportunities/{opportunity_id}")
async def update_opportunity(
    opportunity_id: uuid.UUID,
    data: DealUpdate,
    db: DbSession,
    current_user: CurrentUser,
):
    _require_tenant(current_user.tenant_id)
    obj = await sales_service.update_deal(
        db, current_user.tenant_id, opportunity_id, data
    )
    return success_response(data=obj.model_dump(), message="Opportunity updated")


@router.delete("/crm/opportunities/{opportunity_id}")
async def delete_opportunity(
    opportunity_id: uuid.UUID, db: DbSession, current_user: CurrentUser
):
    _require_tenant(current_user.tenant_id)
    await sales_service.delete_deal(db, current_user.tenant_id, opportunity_id)
    return success_response(message="Opportunity deleted")
