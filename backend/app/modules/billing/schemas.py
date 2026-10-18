import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PriceTerms(Strict):
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    monthly: int = Field(ge=0, le=10**12, strict=True)
    annual: int = Field(ge=0, le=10**12, strict=True)
    seat_monthly: int = Field(default=0, ge=0, le=10**10, strict=True)
    branch_monthly: int = Field(default=0, ge=0, le=10**10, strict=True)
    included_users: int = Field(default=1, ge=1, le=100000)
    included_branches: int = Field(default=1, ge=1, le=10000)
    max_users: int | None = Field(default=None, ge=1)
    max_branches: int | None = Field(default=None, ge=1)
    max_products: int | None = Field(default=None, ge=1)
    max_storage_mb: int | None = Field(default=None, ge=1)
    modules: list[str] = Field(default_factory=list, max_length=100)
    trial_days: int = Field(default=0, ge=0, le=365)
    tax_bps: int = Field(default=0, ge=0, le=10000)
    # Explicit opt-in: only active tenant users are billed, including owners/admins.
    bill_active_users: bool = False

    @model_validator(mode="after")
    def allowances(self) -> PriceTerms:
        if self.max_users is not None and self.max_users < self.included_users:
            raise ValueError("Maximum users cannot be below included users")
        if self.max_branches is not None and self.max_branches < self.included_branches:
            raise ValueError("Maximum branches cannot be below included branches")
        return self


class PlanInput(Strict):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    status: Literal["draft", "active", "archived"] = "draft"
    prices: list[PriceTerms] = Field(min_length=1, max_length=30)
    expected_version: int | None = None

    @model_validator(mode="after")
    def currencies(self) -> PlanInput:
        if len({p.currency for p in self.prices}) != len(self.prices):
            raise ValueError("One price per currency is required")
        return self


class ChangeRequest(Strict):
    plan_id: uuid.UUID
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    cycle: Literal["monthly", "annual"] = "monthly"


class ConfirmRequest(Strict):
    quote_id: uuid.UUID


class SubscriptionAction(Strict):
    action: Literal["cancel", "reactivate", "extend_trial", "discount"]
    at_period_end: bool = True
    days: int = Field(default=0, ge=0, le=365)
    discount_bps: int = Field(default=0, ge=0, le=10000)
    reason: str = Field(min_length=3, max_length=500)


class BillingSettingsInput(Strict):
    require_new_businesses: bool = False
    grace_days: int = Field(default=7, ge=0, le=90)
    due_days: int = Field(default=7, ge=1, le=90)
    reminder_days: int = Field(default=3, ge=1, le=30)
    invoice_prefix: str = Field(default="PES", pattern=r"^[A-Z0-9]{2,10}$")


class PayRequest(Strict):
    phone: str = Field(pattern=r"^[1-9][0-9]{7,14}$")
    provider: str = Field(pattern=r"^[A-Z0-9_]{3,60}$")


class CallbackInput(BaseModel):
    depositId: uuid.UUID


class RefundRequest(Strict):
    amount: int = Field(ge=1, le=10**12, strict=True)
    reason: str = Field(min_length=3, max_length=500)


class RefundCallback(BaseModel):
    refundId: uuid.UUID
