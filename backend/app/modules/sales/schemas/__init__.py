from app.modules.sales.schemas.customer import (
    CustomerBulkCreate,
    CustomerBulkResult,
    CustomerCreate,
    CustomerRead,
    CustomerUpdate,
)
from app.modules.sales.schemas.deal import DealCreate, DealRead, DealUpdate
from app.modules.sales.schemas.order import (
    OrderBulkCreate,
    OrderBulkLine,
    OrderBulkResult,
    OrderCreate,
    OrderRead,
    OrderUpdate,
)
from app.modules.sales.schemas.order_item import OrderItemCreate, OrderItemRead
from app.modules.sales.schemas.return_ import ReturnCreate, ReturnRead, ReturnUpdate
from app.modules.sales.schemas.return_item import ReturnItemCreate, ReturnItemRead
from app.modules.sales.schemas.target import TargetCreate, TargetRead, TargetUpdate

__all__ = [
    "CustomerBulkCreate",
    "CustomerBulkResult",
    "CustomerCreate",
    "CustomerRead",
    "CustomerUpdate",
    "DealCreate",
    "DealRead",
    "DealUpdate",
    "OrderBulkCreate",
    "OrderBulkLine",
    "OrderBulkResult",
    "OrderCreate",
    "OrderItemCreate",
    "OrderItemRead",
    "OrderRead",
    "OrderUpdate",
    "ReturnCreate",
    "ReturnItemCreate",
    "ReturnItemRead",
    "ReturnRead",
    "ReturnUpdate",
    "TargetCreate",
    "TargetRead",
    "TargetUpdate",
]
