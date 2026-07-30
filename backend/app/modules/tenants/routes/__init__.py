from fastapi import APIRouter

from app.modules.tenants.routes.branch import router as branch_router
from app.modules.tenants.routes.department import router as department_router
from app.modules.tenants.routes.permission import router as permission_router
from app.modules.tenants.routes.role import router as role_router
from app.modules.tenants.routes.tenant import router as tenant_router
from app.modules.tenants.routes.user import router as user_router

tenants_router = APIRouter(prefix="/tenants")
global_router = APIRouter(prefix="/global")

tenants_router.include_router(branch_router)
tenants_router.include_router(department_router)
tenants_router.include_router(role_router)
tenants_router.include_router(tenant_router)
tenants_router.include_router(user_router)

global_router.include_router(permission_router)
