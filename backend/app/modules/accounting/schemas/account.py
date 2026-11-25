import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.schemas import TrimmedModel


class AccountCreate(TrimmedModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=255)
    type: Literal["Assets", "Liabilities", "Equity", "Revenue", "Expense"]
    normal_balance: Literal["debit", "credit"]
    description: str | None = None
    is_active: bool = True
    group_name: str | None = Field(default=None, max_length=80)
    parent_id: uuid.UUID | None = None
    pnl_section: Literal["sales", "other_income", "cogs", "operating", "other_expense"] | None = None


class AccountUpdate(TrimmedModel):
    group_name: str | None = Field(default=None, max_length=80)
    parent_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    pnl_section: Literal["sales", "other_income", "cogs", "operating", "other_expense"] | None = None


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    group_name: str | None = None
    parent_id: uuid.UUID | None = None
    pnl_section: str | None = None
    # The section the account is reported in: its own classification, or the code-range fallback when it has none.
    reported_section: str | None = None
    id: uuid.UUID
    tenant_id: uuid.UUID
    code: str
    name: str
    type: str
    normal_balance: str
    description: str | None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @model_validator(mode="after")
    def _reported_section(self):
        from app.modules.accounting.service.pnl_sections import section
        self.reported_section = section(self.type, self.code, self.pnl_section)
        return self
