import uuid
from datetime import datetime

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.services import service
from app.modules.services.schemas import AppointmentCreate, AppointmentUpdate

router = APIRouter(tags=["Services - Appointments"])


@router.get("/services/appointments")
async def list_appointments(
    db: DbSession, current_user: CurrentUser, page_params: PageQuery,
    date_from: datetime | None = None, date_to: datetime | None = None,
    status: str | None = None, employee_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None, search: str | None = None,
):
    items = await service.list_appointments(
        db, current_user.tenant_id, page_params.offset, page_params.limit,
        date_from, date_to, status, employee_id, branch_id, search,
    )
    total = await service.count_appointments(
        db, current_user.tenant_id, date_from, date_to, status, employee_id, branch_id, search,
    )
    return paginated_response(
        items=[i.model_dump() for i in items], total=total,
        page=page_params.page, page_size=page_params.page_size,
        message="Appointments retrieved successfully",
    )


@router.post("/services/appointments")
async def create_appointment(data: AppointmentCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_appointment(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Appointment booked successfully", status_code=201)


@router.get("/services/appointments/{id}")
async def get_appointment(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_appointment(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Appointment retrieved successfully")


@router.patch("/services/appointments/{id}")
async def update_appointment(id: uuid.UUID, data: AppointmentUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_appointment(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Appointment updated successfully")


@router.delete("/services/appointments/{id}")
async def delete_appointment(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_appointment(db, current_user.tenant_id, id)
    return success_response(message="Appointment deleted successfully")
