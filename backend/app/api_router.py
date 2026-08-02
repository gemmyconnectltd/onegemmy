from fastapi import APIRouter

from app.modules.admin.routes import router as admin_router
from app.modules.auth.routes import router as auth_router
from app.modules.finance.routes import finance_router
from app.modules.hr.routes import hr_router
from app.modules.inventory.routes import inventory_router
from app.modules.sales.routes import sales_router
from app.modules.tenants.routes import global_router, tenants_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(tenants_router)
api_router.include_router(global_router)
api_router.include_router(inventory_router, prefix="/tenants")
api_router.include_router(sales_router, prefix="/tenants")
api_router.include_router(finance_router, prefix="/tenants")
api_router.include_router(hr_router, prefix="/tenants")
