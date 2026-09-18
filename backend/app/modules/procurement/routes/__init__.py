from fastapi import APIRouter

from app.modules.procurement.routes.purchase import router as purchase_router
from app.modules.procurement.routes.purchase_return import router as purchase_return_router
from app.modules.procurement.routes.requisition import router as requisition_router
from app.modules.procurement.routes.supplier_bill import router as supplier_bill_router

procurement_router = APIRouter()
procurement_router.include_router(purchase_router)
procurement_router.include_router(purchase_return_router)
procurement_router.include_router(requisition_router)
procurement_router.include_router(supplier_bill_router)
