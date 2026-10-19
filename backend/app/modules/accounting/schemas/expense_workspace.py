from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ExpenseFilters(BaseModel):
    search: str = Field(default="", max_length=100)
    category: str | None = Field(default=None, max_length=50)
    payment_method: Literal["Cash", "Bank Transfer", "Mobile Money", "Card"] | None = None
    status: Literal["Pending", "Approved", "Rejected"] | None = None
    from_date: date | None = None
    to_date: date | None = None

    @model_validator(mode="after")
    def dates(self) -> ExpenseFilters:
        if self.from_date and self.to_date and self.from_date > self.to_date:
            raise ValueError("Start date must not follow end date")
        return self


class ExpenseCategoryInput(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=255)
    is_active: bool = True
