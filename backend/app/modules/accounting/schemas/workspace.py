import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from app.shared.schemas import TrimmedModel

ReportKind = Literal["income-statement", "balance-sheet", "cash-flow", "equity", "trial-balance", "receivables-aging", "payables-aging", "inventory", "general-ledger"]


class ReportRequest(TrimmedModel):
    kind: ReportKind
    from_date: date | None = None
    to_date: date | None = None
    as_of: date | None = None
    branch_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    search: str = Field(default="", max_length=100)
    cash_only: bool = False

    @model_validator(mode="after")
    def dates(self):
        if self.from_date and self.to_date and self.from_date > self.to_date:
            raise ValueError("From date must be on or before to date")
        return self


class TransferRequest(TrimmedModel):
    reference: str = Field(min_length=3, max_length=46)
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    transaction_date: date
    branch_id: uuid.UUID | None = None
    description: str = Field(default="Cash transfer", max_length=500)


class ReconciliationRequest(TrimmedModel):
    reference: str = Field(min_length=3, max_length=100)
    account_id: uuid.UUID
    as_of: date
    branch_id: uuid.UUID | None = None
    statement_balance: Decimal = Field(max_digits=14, decimal_places=2)
    notes: str = Field(default="", max_length=1000)


class AssetRequest(TrimmedModel):
    reference: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    acquisition_date: date
    cost: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    salvage: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    life_months: int = Field(ge=1, le=1200)
    branch_id: uuid.UUID | None = None
    asset_account_id: uuid.UUID
    depreciation_account_id: uuid.UUID
    expense_account_id: uuid.UUID
    acquisition_transaction_id: uuid.UUID | None = None
    paid_from_account_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def salvage_less_than_cost(self):
        if (self.acquisition_transaction_id is None) == (self.paid_from_account_id is None):
            raise ValueError("Choose an existing acquisition journal or a paid-from account for a new purchase")
        if self.salvage > self.cost:
            raise ValueError("Salvage value cannot exceed acquisition cost")
        return self


class AssetAction(TrimmedModel):
    action: Literal["depreciate", "dispose"]
    as_of: date
    proceeds: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    cash_account_id: uuid.UUID | None = None
    gain_loss_account_id: uuid.UUID | None = None


class FiscalPreference(TrimmedModel):
    fiscal_start_month: int = Field(ge=1, le=12)


class DueDateRequest(TrimmedModel):
    due_date: date | None = None


class PayrollPosting(TrimmedModel):
    cash_account_id: uuid.UUID


from app.modules.accounting.schemas.account import AccountCreate


class AccountImport(TrimmedModel):
    items: list[AccountCreate] = Field(min_length=1, max_length=500)


class IncomeReceipt(TrimmedModel):
    client_reference: str = Field(min_length=3, max_length=50)
    transaction_date: date
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    cash_account_id: uuid.UUID
    revenue_account_id: uuid.UUID
    apply_vat: bool = False
    vat_account_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
