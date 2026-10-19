"""Debt workspace contracts; source records remain sales orders and supplier bills."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DebtKind = Literal["receivable", "payable"]
DebtStatus = Literal["Unpaid", "PartiallyPaid", "Paid", "Overdue"]


class DebtFilters(BaseModel):
    search: str = Field(default="", max_length=100)
    status: DebtStatus | None = None
    due_from: date | None = None
    due_to: date | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> DebtFilters:
        if self.due_from and self.due_to and self.due_from > self.due_to:
            raise ValueError("Due from must be on or before due to")
        return self


class DebtPaymentRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: Literal["Cash", "Mobile Money", "Bank Transfer", "Card"]
    paid_at: datetime
    reference_number: str = Field(default="", max_length=50)
    notes: str = Field(default="", max_length=1000)
    client_payment_id: str = Field(min_length=3, max_length=45)


class PayableReceiptRequest(BaseModel):
    due_date: date
