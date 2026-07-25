from fastapi import APIRouter
from app.api.v1.auth.routes import router as auth_router
from app.api.v1.admin.routes import router as admin_router
from app.api.v1.crm.routes import router as crm_router
from app.api.v1.inventory.routes import router as inventory_router
from app.api.v1.finance.routes import router as finance_router
from app.api.v1.projects.routes import router as projects_router
from app.api.v1.dashboard.routes import router as dashboard_router

router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])
router.include_router(admin_router, prefix="/admin", tags=["Admin"])
router.include_router(crm_router, prefix="/crm", tags=["CRM"])
router.include_router(inventory_router, prefix="/inventory", tags=["Inventory"])
router.include_router(finance_router, prefix="/finance", tags=["Finance"])
router.include_router(projects_router, prefix="/projects", tags=["Projects"])
