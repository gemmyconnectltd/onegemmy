import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.departments import service
from app.modules.departments.schemas import DepartmentCreate, DepartmentRead, DepartmentUpdate

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("")
async def list_departments(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    departments = await service.list_for_tenant(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_for_tenant(db, current_user.tenant_id)
    return paginated_response(
        items=[DepartmentRead.model_validate(d).model_dump() for d in departments],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Departments retrieved successfully",
    )


@router.post("")
async def create_department(data: DepartmentCreate, db: DbSession, current_user: CurrentUser):
    dept = await service.create(db, current_user.tenant_id, data)
    return success_response(
        data=DepartmentRead.model_validate(dept).model_dump(),
        message="Department created successfully",
        status_code=201,
    )


@router.get("/{dept_id}")
async def get_department(dept_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    dept = await service.get_by_id(db, current_user.tenant_id, dept_id)
    return success_response(
        data=DepartmentRead.model_validate(dept).model_dump(),
        message="Department retrieved successfully",
    )


@router.patch("/{dept_id}")
async def update_department(
    dept_id: uuid.UUID, data: DepartmentUpdate, db: DbSession, current_user: CurrentUser
):
    dept = await service.get_by_id(db, current_user.tenant_id, dept_id)
    dept = await service.update(db, dept, data)
    return success_response(
        data=DepartmentRead.model_validate(dept).model_dump(),
        message="Department updated successfully",
    )


@router.delete("/{dept_id}")
async def delete_department(dept_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    dept = await service.get_by_id(db, current_user.tenant_id, dept_id)
    await service.delete(db, dept)
    return success_response(message="Department deleted successfully")
