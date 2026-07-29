from fastapi import APIRouter

from app.modules.auth.routes import router as auth_router
from app.modules.departments.routes import router as departments_router
from app.modules.permissions.routes import router as permissions_router
from app.modules.roles.routes import router as roles_router
from app.modules.shops.routes import router as shops_router
from app.modules.tenants.routes import router as tenants_router
from app.modules.users.routes import router as users_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(roles_router)
api_router.include_router(permissions_router)
api_router.include_router(tenants_router)
api_router.include_router(departments_router)
api_router.include_router(shops_router)
