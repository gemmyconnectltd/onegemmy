import uuid

from fastapi import APIRouter, Request

from app.core.deps import CurrentUser, DbSession, SuperUser
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.audit import service

router = APIRouter(tags=["Audit"])


@router.get("/audit/logs")
async def list_audit_logs(
    db: DbSession,
    current_user: CurrentUser,
    page_params: PageQuery,
    action: str | None = None,
    entity_type: str | None = None,
):
    if current_user.tenant_id is None:
        return paginated_response(
            items=[], total=0, page=page_params.page, page_size=page_params.page_size,
            message="Audit logs retrieved successfully",
        )
    items = await service.list_audit_logs(
        db, current_user.tenant_id, page_params.offset, page_params.limit, action, entity_type
    )
    total = await service.count_audit_logs(db, current_user.tenant_id, action, entity_type)
    return paginated_response(
        items=[i.model_dump() for i in items], total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="Audit logs retrieved successfully",
    )


@router.get("/audit/logs/{id}")
async def get_audit_log(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    if current_user.tenant_id is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Audit log entry not found")
    obj = await service.get_audit_log(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Audit log entry retrieved")


@router.get("/admin/audit/logs")
async def admin_list_audit_logs(db: DbSession, _: SuperUser, page_params: PageQuery):
    items = await service.list_platform_audit_logs(db, page_params.offset, page_params.limit)
    total = await service.count_platform_audit_logs(db)
    return paginated_response(
        items=[i.model_dump() for i in items], total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="All audit logs retrieved",
    )
