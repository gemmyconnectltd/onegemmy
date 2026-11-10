import uuid
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

RuleType = Literal[
    "percentage",
    "fixed",
    "product",
    "category",
    "customer",
    "volume",
    "bogo",
    "coupon",
    "order",
    "tiered",
]


class SettingsIn(BaseModel):
    enabled: bool | None = None
    manual_pos: bool | None = None
    automatic: bool | None = None
    campaigns: bool | None = None
    coupons: bool | None = None
    approvals: bool | None = None
    advanced: bool | None = None
    authority: dict | None = None

    @field_validator("authority")
    @classmethod
    def validate_authority(cls, value):
        if value is None:
            return value
        default = Decimal(str(value.get("default_percent", 0)))
        roles = value.get("roles", {})
        if not isinstance(roles, dict) or not default.is_finite() or not 0 <= default <= 100:
            raise ValueError("Invalid authority limits")
        for limit in roles.values():
            number = Decimal(str(limit))
            if not number.is_finite() or not 0 <= number <= 100:
                raise ValueError("Authority must be between zero and 100")
        return value


class RuleIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=2000)
    type: RuleType
    value_kind: Literal["percent", "fixed"] = "percent"
    value: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=4)
    max_discount: Decimal | None = Field(default=None, gt=0)
    config: dict = Field(default_factory=dict)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    priority: int = Field(default=100, ge=0, le=10000)
    combinable: bool = True
    exclusive: bool = False
    max_combined_pct: Decimal | None = Field(default=None, gt=0, le=100)
    campaign_id: uuid.UUID | None = None
    activate: bool = False

    @field_validator("config")
    @classmethod
    def validate_config(cls, value: dict) -> dict:
        # Keep only explicitly configured values: omitted BOGO defaults must not widen scopes.
        return RuleConfig.model_validate(value).model_dump(
            mode="json", by_alias=True, exclude_unset=True
        )


class CampaignIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    code: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    branch_ids: list[uuid.UUID] = Field(default_factory=list)
    target: dict = Field(default_factory=dict)
    usage_limit: int | None = Field(default=None, gt=0)
    budget: Decimal | None = Field(default=None, gt=0)
    rule_ids: list[uuid.UUID] | None = None


class CouponGenerate(BaseModel):
    rule_id: uuid.UUID
    code: str | None = Field(
        default=None, min_length=3, max_length=40
    )  # a chosen code (one coupon); omit to generate
    count: int = Field(default=1, ge=1, le=500)
    prefix: str | None = Field(default=None, max_length=12)
    max_redemptions: int | None = Field(default=None, gt=0)
    per_customer_limit: int | None = Field(default=None, gt=0)
    expires_at: AwareDatetime | None = None
    customer_id: uuid.UUID | None = None


class CouponCheck(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    customer_id: uuid.UUID | None = None


class PriceItem(BaseModel):
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    unit_price: Decimal = Field(ge=0)
    quantity: Decimal = Field(gt=0)
    discount: Decimal = Field(
        default=Decimal(0), ge=0
    )  # an amount typed against this line at the till: a manual discount


class ManualDiscount(BaseModel):
    kind: Literal["percent", "fixed"] = "percent"
    value: Decimal = Field(gt=0)
    reason: str | None = Field(default=None, max_length=500)


class PriceIn(BaseModel):
    manual_reason: str | None = Field(default=None, max_length=500)
    items: list[PriceItem] = Field(min_length=1, max_length=200)
    customer_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    channel: Literal["pos", "sales_order", "quotation"] = "pos"
    coupon_codes: list[str] = Field(default_factory=list, max_length=5)
    manual_discount: ManualDiscount | None = None
    discount_approval_id: uuid.UUID | None = None


class RulePreview(BaseModel):
    rule: RuleIn
    sample: PriceIn | None = None


class ApprovalRequestIn(PriceIn):
    reason: str = Field(min_length=5, max_length=500)


class Decision(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class StatusIn(BaseModel):
    status: Literal[
        "Draft", "Scheduled", "Active", "Paused", "Expired", "Cancelled", "Archived", "Disabled"
    ]


# Validate nested rule JSON at the boundary; malformed rewards must never reach pricing.
class Scope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    variant_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    exclude_product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    exclude_category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    customer_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    customer_types: list[Literal["individual", "business"]] = Field(default_factory=list)
    branch_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    channels: list[Literal["pos", "sales_order", "quotation"]] = Field(default_factory=list)


class Conditions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_order_amount: Decimal | None = Field(default=None, ge=0)
    min_quantity: Decimal | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, gt=0)
    per_customer_limit: int | None = Field(default=None, gt=0)
    min_margin_percent: Decimal | None = Field(default=None, ge=0, lt=100)


class Band(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # "from" is the threshold shared by volume and tiered pricing.
    threshold: Decimal = Field(alias="from", ge=0)
    value: Decimal = Field(ge=0, le=100)


class RewardPool(BaseModel):
    model_config = ConfigDict(extra="forbid")
    qty: int = Field(default=1, gt=0)
    percent: Decimal = Field(default=Decimal(100), ge=0, le=100)
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class RuleConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Scope = Field(default_factory=Scope)
    conditions: Conditions = Field(default_factory=Conditions)
    tiers: list[Band] = Field(default_factory=list, max_length=100)
    thresholds: list[dict] = Field(default_factory=list, max_length=100)
    mode: Literal["highest", "progressive"] = "highest"
    basis: Literal["quantity", "amount"] = "quantity"
    buy: RewardPool = Field(default_factory=RewardPool)
    get: RewardPool = Field(default_factory=RewardPool)
    max_per_sale: int | None = Field(default=None, gt=0)
    per_unit: bool = False
    time_window: dict[str, str] = Field(default_factory=dict)


class CatalogReference(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None


class CatalogPriceIn(BaseModel):
    products: list[CatalogReference] = Field(min_length=1, max_length=200)
    customer_id: uuid.UUID | None = None
    cart: PriceIn | None = None
