"""Who is moving stock, from which branch and why, for the stock ledger.

Stock quantities are changed by plain assignment in many services (sales, returns, purchases, production, adjustments). The ledger hook
reads this context at flush time so every change lands in a warehouse with a type, a reference and a responsible user, without each
service having to know about warehouses. The hook clears the reason once it has used it, so one operation cannot label the next.
"""
import uuid
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class StockReason:
    movement_type: str
    reference_type: str | None = None
    reference_id: uuid.UUID | None = None
    reference_number: str | None = None
    note: str | None = None
    warehouse_id: uuid.UUID | None = None


current_user_id: ContextVar[uuid.UUID | None] = ContextVar("stock_user_id", default=None)
current_branch_id: ContextVar[uuid.UUID | None] = ContextVar("stock_branch_id", default=None)
current_reason: ContextVar[StockReason | None] = ContextVar("stock_reason", default=None)


def set_reason(movement_type: str, *, reference_type: str | None = None, reference_id: uuid.UUID | None = None,
               reference_number: str | None = None, note: str | None = None, warehouse_id: uuid.UUID | None = None) -> None:
    current_reason.set(StockReason(movement_type, reference_type, reference_id, reference_number, note, warehouse_id))
