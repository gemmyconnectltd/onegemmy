from fastapi import APIRouter

from app.modules.sales.routes.customer import router as customer_router
from app.modules.sales.routes.deal import router as deal_router
from app.modules.sales.routes.order import router as order_router
from app.modules.sales.routes.return_ import router as return_router
from app.modules.sales.routes.target import router as target_router

sales_router = APIRouter()
sales_router.include_router(customer_router)
sales_router.include_router(deal_router)
sales_router.include_router(order_router)
sales_router.include_router(return_router)
sales_router.include_router(target_router)
