import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.shared.schemas import TrimmedModel

PreferredContact = Literal["email", "phone", "whatsapp", "all"]
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class TimezoneModel(TrimmedModel):
    @field_validator("timezone", check_fields=False)
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Choose an IANA timezone, for example Africa/Kigali") from None
        return value


class TenantCreate(TimezoneModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=100)
    logo_url: str | None = None
    brand_color: HexColor | None = None
    website: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    timezone: str | None = None
    currency: str | None = None
    vat_enabled: bool | None = None
    multi_branch: bool | None = None
    business_type: str | None = None
    industry: str | None = None
    business_category: str | None = None
    employee_count: str | None = None
    business_location: str | None = None
    heard_about: str | None = None
    referral_code: str | None = None
    preferred_contact: PreferredContact | None = None


class TenantUpdate(TimezoneModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None
    logo_url: str | None = None
    brand_color: HexColor | None = None
    website: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    subscription_plan: str | None = None
    subscription_status: str | None = None
    # Superadmin-only in practice: the tenant self-service update route
    # rejects this field, see app/modules/tenants/routes/tenant.py.
    timezone: str | None = None
    currency: str | None = None
    vat_enabled: bool | None = None
    multi_branch: bool | None = None
    # Needs credit:approve (GM/CEO) — enforced in the route.
    credit_daily_limit: Decimal | None = Field(default=None, ge=0)
    business_type: str | None = None
    industry: str | None = None
    business_category: str | None = None
    employee_count: str | None = None
    business_location: str | None = None
    heard_about: str | None = None
    referral_code: str | None = None
    preferred_contact: PreferredContact | None = None


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    archived_at: datetime | None = None
    suspended_at: datetime | None = None
    suspension_reason: str | None = None
    reactivated_at: datetime | None = None
    logo_url: str | None
    brand_color: str | None
    website: str | None
    phone: str | None
    address: str | None
    city: str | None
    country: str | None
    subscription_plan: str
    subscription_status: str
    timezone: str = "UTC"
    currency: str
    vat_enabled: bool = True
    multi_branch: bool = False
    credit_daily_limit: Decimal | None = None
    business_type: str | None = None
    industry: str | None = None
    business_category: str | None = None
    employee_count: str | None = None
    business_location: str | None = None
    heard_about: str | None = None
    referral_code: str | None = None
    preferred_contact: PreferredContact | None = None
    features: dict[str, bool] | None = None
    limits: dict[str, int | None] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenantFeatureSummary(BaseModel):
    """Effective entitlements exposed to a tenant's own clients (no admin detail)."""

    model_config = ConfigDict(from_attributes=True)

    features: dict[str, bool]
    limits: dict[str, int | None]
