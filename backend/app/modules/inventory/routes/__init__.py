from fastapi import APIRouter

from app.modules.inventory.routes.batch import router as batch_router
from app.modules.inventory.routes.brand import router as brand_router
from app.modules.inventory.routes.category import router as category_router
from app.modules.inventory.routes.product import router as product_router
from app.modules.inventory.routes.retail import router as retail_router
from app.modules.inventory.routes.serial import router as serial_router
from app.modules.inventory.routes.supplier import router as supplier_router
from app.modules.inventory.routes.transfer import router as transfer_router
from app.modules.inventory.routes.unit import router as unit_router
from app.modules.inventory.routes.valuation import router as valuation_router
from app.modules.inventory.routes.variant import router as variant_router

inventory_router = APIRouter()
inventory_router.include_router(batch_router)
inventory_router.include_router(category_router)
inventory_router.include_router(brand_router)
inventory_router.include_router(unit_router)
inventory_router.include_router(supplier_router)
inventory_router.include_router(product_router)
inventory_router.include_router(variant_router)
inventory_router.include_router(serial_router)
inventory_router.include_router(retail_router)
inventory_router.include_router(transfer_router)
inventory_router.include_router(valuation_router)
