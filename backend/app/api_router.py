from fastapi import APIRouter

from app.modules.auth.routes import router as auth_router
from app.modules.tenants.routes import router as tenants_router
from app.modules.users.routes import router as users_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(tenants_router)
