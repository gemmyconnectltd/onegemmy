from fastapi import APIRouter, Depends

from app.core.deps import require_feature
from app.modules.accounting.routes import accounting_router
from app.modules.admin.analytics import router as admin_analytics_router
from app.modules.admin.routes import router as admin_router
from app.modules.ai.routes import admin_router as ai_admin_router
from app.modules.ai.routes import router as ai_router
from app.modules.audit.routes import router as audit_router
from app.modules.auth.routes import router as auth_router
from app.modules.billing.routes import admin_router as billing_admin_router
from app.modules.billing.routes import callback_router as billing_callback_router
from app.modules.billing.routes import tenant_router as billing_tenant_router
from app.modules.crm.routes import crm_router
from app.modules.currency.routes import admin_router as currency_admin_router
from app.modules.currency.routes import tenant_router as currency_tenant_router
from app.modules.hr.routes import hr_router
from app.modules.inventory.routes import inventory_router
from app.modules.manufacturing.routes import manufacturing_router
from app.modules.marketing.routes import public_router as marketing_public_router
from app.modules.marketing.routes import router as marketing_router
from app.modules.procurement.routes import procurement_router
from app.modules.repairs.routes import router as repairs_router
from app.modules.sales.routes import sales_router
from app.modules.services.routes import services_router
from app.modules.support.routes import router as support_router
from app.modules.tenants.routes import global_router, tenants_router
from app.modules.traffic.routes import activity_router as traffic_activity_router
from app.modules.traffic.routes import admin_router as traffic_admin_router
from app.modules.traffic.routes import public_router as traffic_public_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(billing_admin_router)
api_router.include_router(billing_tenant_router)
api_router.include_router(billing_callback_router)
api_router.include_router(admin_router)
api_router.include_router(admin_analytics_router)
api_router.include_router(traffic_admin_router)
api_router.include_router(traffic_public_router)
api_router.include_router(traffic_activity_router)
api_router.include_router(marketing_router)
api_router.include_router(marketing_public_router)
api_router.include_router(currency_admin_router)
api_router.include_router(ai_router)
api_router.include_router(ai_admin_router)
api_router.include_router(currency_tenant_router)
api_router.include_router(audit_router)
api_router.include_router(support_router)
api_router.include_router(auth_router)
api_router.include_router(tenants_router)
api_router.include_router(global_router)
api_router.include_router(inventory_router, prefix="/tenants", dependencies=[Depends(require_feature("inventory"))])
api_router.include_router(sales_router, prefix="/tenants", dependencies=[Depends(require_feature("sales"))])
api_router.include_router(accounting_router, prefix="/tenants", dependencies=[Depends(require_feature("accounting"))])
api_router.include_router(hr_router, prefix="/tenants", dependencies=[Depends(require_feature("hr"))])
api_router.include_router(procurement_router, prefix="/tenants", dependencies=[Depends(require_feature("procurement"))])
api_router.include_router(crm_router, prefix="/tenants", dependencies=[Depends(require_feature("crm"))])
api_router.include_router(manufacturing_router, prefix="/tenants", dependencies=[Depends(require_feature("manufacturing"))])
api_router.include_router(repairs_router, prefix="/tenants", dependencies=[Depends(require_feature("repairs"))])
api_router.include_router(services_router, prefix="/tenants", dependencies=[Depends(require_feature("services"))])
