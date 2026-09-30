import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import success_response
from app.modules.services import service
from app.modules.services.schemas import EmployeeServiceCreate, EmployeeServiceUpdate

router = APIRouter(tags=["Services - Staff & Commissions"])


@router.get("/services/staff-commissions")
async def list_employee_services(db: DbSession, current_user: CurrentUser):
    items = await service.list_employee_services_for_tenant(db, current_user.tenant_id)
    return success_response(data=[i.model_dump() for i in items], message="Staff service assignments retrieved successfully")


@router.get("/services/staff-commissions/employee/{employee_id}")
async def list_employee_services_for_employee(employee_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    items = await service.list_employee_services_for_employee(db, current_user.tenant_id, employee_id)
    return success_response(data=[i.model_dump() for i in items], message="Staff service assignments retrieved successfully")


@router.post("/services/staff-commissions")
async def create_employee_service(data: EmployeeServiceCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_employee_service(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Staff service assignment created successfully", status_code=201)


@router.patch("/services/staff-commissions/{id}")
async def update_employee_service(id: uuid.UUID, data: EmployeeServiceUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_employee_service(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Staff service assignment updated successfully")


@router.delete("/services/staff-commissions/{id}")
async def delete_employee_service(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_employee_service(db, current_user.tenant_id, id)
    return success_response(message="Staff service assignment removed successfully")
