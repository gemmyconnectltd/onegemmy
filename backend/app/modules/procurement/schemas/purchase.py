import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.inventory.schemas.supplier import SupplierRead


class PurchaseItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    sku: str | None = None
    variant_attributes: dict | None = None
    unit_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    quantity: Decimal = Field(default=Decimal(1), gt=0, max_digits=12, decimal_places=3)
    update_catalog_cost: bool = False
    selling_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def bounded_line(self):
        if self.unit_cost * self.quantity > Decimal("999999999999.99"):
            raise ValueError("Purchase line total exceeds the supported amount")
        return self


class PurchaseItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    sku: str | None
    variant_attributes: dict | None
    unit_cost: float
    quantity: float
    line_total: float
    update_catalog_cost: bool = False
    selling_price: Decimal | None = None


class PurchaseCreate(BaseModel):
    supplier_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    expected_date: date | None = None
    status: str = "Draft"
    discount: float = Field(default=0, ge=0)
    tax: float = Field(default=0, ge=0)
    notes: str | None = None
    # Foreign-currency purchase. Omit for the tenant's base currency. `exchange_rate` = units of base
    # currency per 1 `currency_code`; omit to use the tenant/platform rate in force now. Frozen when the
    # purchase is received (that is when the liability and ledger entry are created).
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)
    items: list[PurchaseItemCreate] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def bounded_total(self):
        total = sum((item.unit_cost * item.quantity for item in self.items), Decimal(0)) - Decimal(str(self.discount)) + Decimal(str(self.tax))
        if total < 0 or total > Decimal("999999999999.99"):
            raise ValueError("Purchase total must be nonnegative and within the supported amount")
        return self


class PurchaseUpdate(BaseModel):
    items: list[PurchaseItemCreate] | None = Field(default=None, min_length=1, max_length=200)
    supplier_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    expected_date: date | None = None
    discount: float | None = Field(default=None, ge=0)
    tax: float | None = Field(default=None, ge=0)
    notes: str | None = None
    # Draft purchases only: the currency / rate stay editable until the goods are received.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


class PurchaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    status: str
    subtotal: float
    discount: float
    tax: float
    total: float
    # Amounts above are in `currency_code` (None = tenant base currency); base_* are their value in the
    # tenant's base currency at the frozen `exchange_rate`.
    currency_code: str | None = None
    exchange_rate: Decimal | None = None
    base_subtotal: Decimal | None = None
    base_discount: Decimal | None = None
    base_tax: Decimal | None = None
    base_total: Decimal | None = None
    notes: str | None
    expected_date: date | None
    received_at: datetime | None
    supplier_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    created_by: uuid.UUID | None
    supplier: SupplierRead | None = None
    items: list[PurchaseItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
