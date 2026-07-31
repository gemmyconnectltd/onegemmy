from fastapi import APIRouter

from app.modules.inventory.routes.brand import router as brand_router
from app.modules.inventory.routes.category import router as category_router
from app.modules.inventory.routes.product import router as product_router
from app.modules.inventory.routes.supplier import router as supplier_router
from app.modules.inventory.routes.unit import router as unit_router

inventory_router = APIRouter()
inventory_router.include_router(category_router)
inventory_router.include_router(brand_router)
inventory_router.include_router(unit_router)
inventory_router.include_router(supplier_router)
inventory_router.include_router(product_router)
