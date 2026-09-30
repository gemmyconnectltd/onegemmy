from fastapi import APIRouter

from app.modules.services.routes.appointment import router as appointment_router
from app.modules.services.routes.category import router as category_router
from app.modules.services.routes.employee_service import router as employee_service_router
from app.modules.services.routes.queue_entry import router as queue_entry_router
from app.modules.services.routes.service import router as service_router

services_router = APIRouter()
services_router.include_router(category_router)
services_router.include_router(service_router)
services_router.include_router(employee_service_router)
services_router.include_router(appointment_router)
services_router.include_router(queue_entry_router)
