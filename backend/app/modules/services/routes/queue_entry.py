import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import success_response
from app.modules.services import service
from app.modules.services.schemas import QueueEntryCreate, QueueEntryUpdate

router = APIRouter(tags=["Services - Walk-in Queue"])


@router.get("/services/queue")
async def list_queue_entries(db: DbSession, current_user: CurrentUser, status: str | None = None):
    items = await service.list_queue_entries(db, current_user.tenant_id, status)
    return success_response(data=[i.model_dump() for i in items], message="Queue retrieved successfully")


@router.post("/services/queue")
async def create_queue_entry(data: QueueEntryCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_queue_entry(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Added to queue successfully", status_code=201)


@router.patch("/services/queue/{id}")
async def update_queue_entry(id: uuid.UUID, data: QueueEntryUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_queue_entry(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Queue entry updated successfully")


@router.delete("/services/queue/{id}")
async def delete_queue_entry(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_queue_entry(db, current_user.tenant_id, id)
    return success_response(message="Queue entry removed successfully")
