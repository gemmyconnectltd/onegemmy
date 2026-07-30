from fastapi import APIRouter

from app.modules.admin.routes import router as admin_router
from app.modules.auth.routes import router as auth_router
from app.modules.tenants.routes import global_router, tenants_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(tenants_router)
api_router.include_router(global_router)
