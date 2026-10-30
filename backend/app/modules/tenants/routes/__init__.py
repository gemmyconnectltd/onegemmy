from fastapi import APIRouter

from app.modules.reporting.routes.daily import router as daily_router
from app.modules.tenants.routes.access import router as access_router
from app.modules.tenants.routes.branch import router as branch_router
from app.modules.tenants.routes.currency import router as currency_router
from app.modules.tenants.routes.department import router as department_router
from app.modules.tenants.routes.permission import router as permission_router
from app.modules.tenants.routes.public import router as public_router
from app.modules.tenants.routes.role import router as role_router
from app.modules.tenants.routes.tenant import router as tenant_router
from app.modules.tenants.routes.user import router as user_router

tenants_router = APIRouter(prefix="/tenants")
global_router = APIRouter(prefix="/global")

tenants_router.include_router(daily_router)
tenants_router.include_router(branch_router)
tenants_router.include_router(department_router)
tenants_router.include_router(access_router)
tenants_router.include_router(role_router)
# Static paths (/users, ...) must be registered before tenant_router, whose "/{tenant_id}" would otherwise
# capture them (GET /tenants/users would be parsed as tenant_id="users" and fail with 422).
tenants_router.include_router(user_router)
tenants_router.include_router(tenant_router)

global_router.include_router(permission_router)
global_router.include_router(currency_router)
global_router.include_router(public_router)
