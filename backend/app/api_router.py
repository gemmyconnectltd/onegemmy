from fastapi import APIRouter

from app.modules.auth.routes import router as auth_router
from app.modules.crm.routes import router as crm_router
from app.modules.dashboard.routes import router as dashboard_router
from app.modules.finance.routes import router as finance_router
from app.modules.inventory.routes import router as inventory_router
from app.modules.permissions.routes import router as permissions_router
from app.modules.projects.routes import router as projects_router
from app.modules.roles.routes import router as roles_router
from app.modules.tenants.routes import router as tenants_router
from app.modules.users.routes import router as users_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(roles_router)
api_router.include_router(permissions_router)
api_router.include_router(tenants_router)
api_router.include_router(crm_router)
api_router.include_router(inventory_router)
api_router.include_router(finance_router)
api_router.include_router(dashboard_router)
api_router.include_router(projects_router)
