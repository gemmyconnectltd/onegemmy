"""Read-only views for Users -> Access Management and Roles & Permissions. Changing access still happens through the existing
role and user endpoints (assign a role, edit a role's permissions); these only show what the result is."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.tenants.models import User
from app.modules.tenants.repository import RoleRepository
from app.modules.tenants.service import access

router = APIRouter(tags=["Access"])


def _tenant(user) -> uuid.UUID:
    if user.tenant_id is None:
        raise ForbiddenError("Access management belongs to a business account")
    return user.tenant_id


@router.get("/users/access-summary", dependencies=[Depends(require_permission("users:read"))])
async def access_summary(db: DbSession, current_user: CurrentUser, page_params: PageQuery, search: str | None = Query(None, max_length=120),
                         role_id: uuid.UUID | None = None, branch_id: uuid.UUID | None = None, status: str | None = Query(None, pattern="^(active|inactive)$"),
                         assigned_only: bool = False):
    data = await access.access_summary(db, _tenant(current_user), search=search, role_id=role_id, branch_id=branch_id, status=status,
                                       offset=page_params.offset, limit=page_params.limit, assigned_only=assigned_only)
    return paginated_response(items=data["items"], total=data["total"], page=page_params.page, page_size=page_params.page_size,
                              message="Access summary retrieved", summary=data["summary"])


@router.get("/users/{user_id}/access", dependencies=[Depends(require_permission("users:read"))])
async def user_access(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant_id = _tenant(current_user)
    user = (await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))).scalar_one_or_none()
    if user is None:  # also what anyone outside this business gets
        raise NotFoundError("User not found")
    return success_response(data=await access.user_access(db, tenant_id, user), message="User access retrieved")


@router.get("/roles/{role_id}/access", dependencies=[Depends(require_permission("roles:read"))])
async def role_access(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    role = await RoleRepository(db).get_by_id_for_tenant(_tenant(current_user), role_id)
    if role is None:
        raise NotFoundError("Role not found")
    return success_response(data=await access.role_access(db, role.tenant_id, role), message="Role access retrieved")


@router.get("/me/modules/{key}/access")
async def module_access(key: str, db: DbSession, current_user: CurrentUser):
    """Which roles can use one module and what changed about it. Visible to anyone who can read roles."""
    await require_permission("roles:read")(current_user)
    data = await access.module_detail(db, _tenant(current_user), key)
    if data is None:
        raise NotFoundError("Module not found")
    return success_response(data=data, message="Module access retrieved")
