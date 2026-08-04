from fastapi import APIRouter

from app.modules.procurement.routes.purchase import router as purchase_router

procurement_router = APIRouter()
procurement_router.include_router(purchase_router)
