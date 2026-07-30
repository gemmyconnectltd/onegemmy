import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
<<<<<<< HEAD
from app.core.response import paginated_response
from app.core.response import success_response
=======
from app.core.response import paginated_response, success_response
>>>>>>> feature/full-crud-rbac
from app.modules.tenants import service
from app.modules.tenants.schemas import DepartmentCreate, DepartmentUpdate

router = APIRouter(tags=["Departments"])


@router.get("/departments")
async def list_departments(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    departments = await service.list_departments(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_departments(db, current_user.tenant_id)
    return paginated_response(
        items=[d.model_dump() for d in departments],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Departments retrieved successfully",
    )


@router.post("/departments")
async def create_department(data: DepartmentCreate, db: DbSession, current_user: CurrentUser):
    dept = await service.create_department(db, current_user.tenant_id, data)
    return success_response(
        data=dept.model_dump(),
        message="Department created successfully",
        status_code=201,
    )


@router.get("/departments/{dept_id}")
async def get_department(dept_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    dept = await service.get_department(db, current_user.tenant_id, dept_id)
    return success_response(
        data=dept.model_dump(),
        message="Department retrieved successfully",
    )


@router.patch("/departments/{dept_id}")
async def update_department(
    dept_id: uuid.UUID, data: DepartmentUpdate, db: DbSession, current_user: CurrentUser
):
    dept = await service.update_department(db, current_user.tenant_id, dept_id, data)
    return success_response(
        data=dept.model_dump(),
        message="Department updated successfully",
    )


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_department(db, current_user.tenant_id, dept_id)
    return success_response(message="Department deleted successfully")
