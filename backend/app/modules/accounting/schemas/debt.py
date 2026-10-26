"""Debt workspace contracts; source records remain sales orders and supplier bills."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DebtKind = Literal["receivable", "payable"]
DebtStatus = Literal["Unpaid", "PartiallyPaid", "Paid", "Overdue", "WrittenOff"]


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


class DebtEditRequest(BaseModel):
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    reference: str | None = Field(default=None, min_length=1, max_length=50)


class DebtReasonRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def trimmed(self) -> DebtReasonRequest:
        self.reason = self.reason.strip()
        if len(self.reason) < 3:
            raise ValueError("A reason is required")
        return self


class ManualDebtRequest(BaseModel):
    party_id: uuid.UUID
    branch_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    issue_date: date
    due_date: date | None = None
    reference: str = Field(default="", max_length=50)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def dates(self) -> ManualDebtRequest:
        if self.due_date and self.due_date < self.issue_date:
            raise ValueError("Due date cannot be before the issue date")
        return self


class DebtReminderRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    message: str = Field(default="", max_length=1000)


class StatementSendRequest(BaseModel):
    party_id: uuid.UUID
    date_from: date | None = None
    date_to: date | None = None
