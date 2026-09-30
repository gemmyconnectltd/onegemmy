from app.modules.sales.repository.customer import CustomerRepository
from app.modules.sales.repository.deal import DealRepository
from app.modules.sales.repository.order import OrderRepository
from app.modules.sales.repository.order_payment import OrderPaymentRepository
from app.modules.sales.repository.return_ import ReturnRepository
from app.modules.sales.repository.target import TargetRepository

__all__ = [
    "CustomerRepository", "DealRepository", "OrderPaymentRepository", "OrderRepository",
    "ReturnRepository", "TargetRepository",
]
