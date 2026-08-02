import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.hr import service
from app.modules.hr.schemas import ApplicantCreate, ApplicantUpdate

router = APIRouter(tags=["HR - Applicants"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/hr/applicants")
async def list_applicants(db: DbSession, current_user: CurrentUser, page_params: PageQuery, stage: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_applicants(db, current_user.tenant_id, stage, page_params.offset, page_params.limit)
    total = await service.count_applicants(db, current_user.tenant_id, stage)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Applicants retrieved")


@router.post("/hr/applicants")
async def create_applicant(data: ApplicantCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_applicant(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Applicant created", status_code=201)


@router.get("/hr/applicants/{id}")
async def get_applicant(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_applicant(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Applicant retrieved")


@router.patch("/hr/applicants/{id}")
async def update_applicant(id: uuid.UUID, data: ApplicantUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_applicant(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Applicant updated")


@router.delete("/hr/applicants/{id}")
async def delete_applicant(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_applicant(db, current_user.tenant_id, id)
    return success_response(message="Applicant deleted")
