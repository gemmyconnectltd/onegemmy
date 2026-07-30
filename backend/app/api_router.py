from fastapi import APIRouter

from app.modules.auth.routes import router as auth_router
from app.modules.tenants.routes import global_router, tenants_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(tenants_router)
api_router.include_router(global_router)
