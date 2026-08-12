from fastapi import APIRouter, Depends

from app.core.deps import require_feature
from app.modules.admin.routes import router as admin_router
from app.modules.audit.routes import router as audit_router
from app.modules.auth.routes import router as auth_router
from app.modules.crm.routes import crm_router
from app.modules.finance.routes import finance_router
from app.modules.hr.routes import hr_router
from app.modules.inventory.routes import inventory_router
from app.modules.manufacturing.routes import manufacturing_router
from app.modules.procurement.routes import procurement_router
from app.modules.repairs.routes import router as repairs_router
from app.modules.sales.routes import sales_router
from app.modules.tenants.routes import global_router, tenants_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_router)
api_router.include_router(audit_router)
api_router.include_router(auth_router)
api_router.include_router(tenants_router)
api_router.include_router(global_router)
api_router.include_router(inventory_router, prefix="/tenants", dependencies=[Depends(require_feature("inventory"))])
api_router.include_router(sales_router, prefix="/tenants", dependencies=[Depends(require_feature("sales"))])
api_router.include_router(finance_router, prefix="/tenants", dependencies=[Depends(require_feature("finance"))])
api_router.include_router(hr_router, prefix="/tenants", dependencies=[Depends(require_feature("hr"))])
api_router.include_router(procurement_router, prefix="/tenants", dependencies=[Depends(require_feature("procurement"))])
api_router.include_router(crm_router, prefix="/tenants", dependencies=[Depends(require_feature("crm"))])
api_router.include_router(manufacturing_router, prefix="/tenants", dependencies=[Depends(require_feature("manufacturing"))])
api_router.include_router(repairs_router, prefix="/tenants", dependencies=[Depends(require_feature("repairs"))])
