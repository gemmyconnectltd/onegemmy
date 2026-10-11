import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CurrencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    symbol: str
    decimal_places: int
    is_active: bool = True


class ExchangeRateCreate(BaseModel):
    """1 `base_currency` = `rate` `quote_currency`."""

    base_currency: str = Field(min_length=3, max_length=3)
    quote_currency: str = Field(min_length=3, max_length=3)
    rate: Decimal = Field(gt=0)
    effective_at: datetime | None = None


class ExchangeRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID | None
    base_currency: str
    quote_currency: str
    rate: Decimal
    effective_at: datetime
    source: str
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None


class ReportingCurrencyUpdate(BaseModel):
    currency: str = Field(min_length=3, max_length=3)


class BaseCurrencyUpdate(BaseModel):
    currency: str = Field(min_length=3, max_length=3)
