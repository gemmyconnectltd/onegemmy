from app.modules.sales.schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate
from app.modules.sales.schemas.deal import DealCreate, DealRead, DealUpdate
from app.modules.sales.schemas.order import OrderCreate, OrderRead, OrderUpdate
from app.modules.sales.schemas.order_item import OrderItemCreate, OrderItemRead
from app.modules.sales.schemas.return_ import ReturnCreate, ReturnRead, ReturnUpdate
from app.modules.sales.schemas.return_item import ReturnItemCreate, ReturnItemRead
from app.modules.sales.schemas.target import TargetCreate, TargetRead, TargetUpdate

__all__ = [
    "CustomerCreate",
    "CustomerRead",
    "CustomerUpdate",
    "DealCreate",
    "DealRead",
    "DealUpdate",
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
