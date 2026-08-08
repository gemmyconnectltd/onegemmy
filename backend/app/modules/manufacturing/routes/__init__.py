from fastapi import APIRouter

from app.modules.manufacturing.routes.production_order import router as production_order_router

manufacturing_router = APIRouter()
manufacturing_router.include_router(production_order_router)
