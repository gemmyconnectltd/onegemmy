import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.crm import service
from app.modules.crm.schemas import ActivityCreate, ActivityUpdate

router = APIRouter(tags=["CRM - Activities"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/crm/activities")
async def list_activities(
    db: DbSession,
    current_user: CurrentUser,
    page_params: PageQuery,
    customer_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    status: str | None = Query(None, pattern="^(open|done|cancelled)$"),
    search: str | None = Query(None, max_length=100),
):
    _require_tenant(current_user.tenant_id)
    tenant_id = current_user.tenant_id
    items = await service.list_activities(
        db, tenant_id, page_params.offset, page_params.limit, customer_id, deal_id, status, search
    )
    total = await service.count_activities(db, tenant_id, customer_id, deal_id, status, search)
    return paginated_response(
        items=[item.model_dump() for item in items],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Activities retrieved successfully",
    )


@router.post("/crm/activities")
async def create_activity(data: ActivityCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_activity(
        db, current_user.tenant_id, current_user.id, current_user.full_name, data
    )
    return success_response(data=obj.model_dump(), message="Activity created", status_code=201)


@router.patch("/crm/activities/{activity_id}")
async def update_activity(
    activity_id: uuid.UUID, data: ActivityUpdate, db: DbSession, current_user: CurrentUser
):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_activity(
        db,
        current_user.tenant_id,
        activity_id,
        current_user.id,
        current_user.full_name,
        data,
    )
    return success_response(data=obj.model_dump(), message="Activity updated")


@router.delete("/crm/activities/{activity_id}")
async def delete_activity(
    activity_id: uuid.UUID, db: DbSession, current_user: CurrentUser
):
    _require_tenant(current_user.tenant_id)
    await service.delete_activity(
        db, current_user.tenant_id, activity_id, current_user.id, current_user.full_name
    )
    return success_response(message="Activity deleted")
