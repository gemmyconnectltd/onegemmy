import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.crm import service
from app.modules.crm.schemas import EmailLogCreate, EmailLogUpdate

router = APIRouter(tags=["CRM - Emails"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/crm/emails")
async def list_emails(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    _require_tenant(current_user.tenant_id)
    items = await service.list_emails(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_emails(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Emails retrieved successfully")


@router.post("/crm/emails")
async def create_email(data: EmailLogCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_email(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Email logged successfully", status_code=201)


@router.get("/crm/emails/{id}")
async def get_email(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_email(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Email retrieved successfully")


@router.patch("/crm/emails/{id}")
async def update_email(id: uuid.UUID, data: EmailLogUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_email(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Email updated successfully")


@router.delete("/crm/emails/{id}")
async def delete_email(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_email(db, current_user.tenant_id, id)
    return success_response(message="Email deleted successfully")
