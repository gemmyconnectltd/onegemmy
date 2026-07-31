from app.modules.sales.service.customer import (
    count_customers, create_customer, delete_customer, get_customer, list_customers, update_customer,
)
from app.modules.sales.service.deal import (
    count_deals, create_deal, delete_deal, get_deal, list_deals, update_deal,
)
from app.modules.sales.service.order import (
    count_orders, create_order, delete_order, get_order, list_orders, update_order,
)
from app.modules.sales.service.return_ import (
    count_returns, create_return, delete_return, get_return, list_returns, update_return,
)
from app.modules.sales.service.target import (
    count_targets, create_target, delete_target, get_target, list_targets, update_target,
)

__all__ = [
    "count_customers", "create_customer", "delete_customer", "get_customer", "list_customers", "update_customer",
    "count_deals", "create_deal", "delete_deal", "get_deal", "list_deals", "update_deal",
    "count_orders", "create_order", "delete_order", "get_order", "list_orders", "update_order",
    "count_returns", "create_return", "delete_return", "get_return", "list_returns", "update_return",
    "count_targets", "create_target", "delete_target", "get_target", "list_targets", "update_target",
]
