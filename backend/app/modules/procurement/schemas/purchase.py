import uuid
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.modules.inventory.schemas.supplier import SupplierRead


class PurchaseItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    sku: str | None = None
    variant_attributes: dict | None = None
    unit_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    quantity: Decimal = Field(default=Decimal(1), gt=0, max_digits=12, decimal_places=3)
    is_service: bool = False
    expense_account_id: uuid.UUID | None = None
    tax_rate: Literal[0, 18] = 18
    update_catalog_cost: bool = False
    selling_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def bounded_line(self):
        if self.is_service and (self.product_id or self.variant_id or not self.expense_account_id or self.update_catalog_cost or self.selling_price is not None):
            raise ValueError("Service lines require an expense account and cannot change inventory or catalog pricing")
        if not self.is_service and not (self.product_id or self.variant_id):
            raise ValueError("Choose an inventory product or mark the line as a service")
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
    is_service: bool = False
    expense_account_id: uuid.UUID | None = None
    tax_rate: Decimal | None = None
    received_quantity: Decimal = Decimal(0)
    update_catalog_cost: bool = False
    selling_price: Decimal | None = None


class PurchaseCreate(BaseModel):
    supplier_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    expected_date: date | None = None
    status: Literal["Draft", "PendingApproval"] = "Draft"
    order_date: date | None = None
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    supplier_reference: str | None = Field(default=None, max_length=100)
    delivery_instructions: str | None = Field(default=None, max_length=2000)
    client_reference: str | None = Field(default=None, min_length=3, max_length=50)
    discount: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    tax: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = None
    # Foreign-currency purchase. Omit for the tenant's base currency. `exchange_rate` = units of base
    # currency per 1 `currency_code`; omit to use the tenant/platform rate in force now. Frozen when the
    # purchase is received (that is when the liability and ledger entry are created).
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)
    items: list[PurchaseItemCreate] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def bounded_total(self):
        if self.order_date and self.expected_date and self.expected_date < self.order_date:
            raise ValueError("Expected delivery cannot precede the order date")
        if self.status != "Draft" and not self.supplier_id:
            raise ValueError("Select a supplier before submitting the purchase order")
        total = sum((item.unit_cost * item.quantity for item in self.items), Decimal(0)) - Decimal(str(self.discount)) + Decimal(str(self.tax))
        if total < 0 or total > Decimal("999999999999.99"):
            raise ValueError("Purchase total must be nonnegative and within the supported amount")
        return self


class PurchaseUpdate(BaseModel):
    order_date: date | None = None
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    supplier_reference: str | None = Field(default=None, max_length=100)
    delivery_instructions: str | None = Field(default=None, max_length=2000)
    items: list[PurchaseItemCreate] | None = Field(default=None, min_length=1, max_length=200)
    supplier_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    expected_date: date | None = None
    discount: Decimal | None = Field(default=None, ge=0)
    tax: Decimal | None = Field(default=None, ge=0)
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
    billing_status: str | None = None
    payment_status: str | None = None
    order_date: date | None = None
    payment_terms_days: int | None = None
    supplier_reference: str | None = None
    delivery_instructions: str | None = None
    subtotal: float
    discount: Decimal
    tax: Decimal
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


    @computed_field
    @property
    def included_vat(self) -> Decimal | None:
        if any(item.tax_rate is None for item in self.items):
            return None
        gross = Decimal(str(self.subtotal))
        discount_factor = (gross - self.discount) / gross if gross else Decimal(1)
        return sum((Decimal(str(item.line_total)) * discount_factor * item.tax_rate / (100 + item.tax_rate)
                    for item in self.items), Decimal(0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class ReceiptLineInput(BaseModel):
    purchase_item_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class ReceiptCreate(BaseModel):
    client_reference: str = Field(min_length=3, max_length=50)
    lines: list[ReceiptLineInput] = Field(min_length=1, max_length=200)
    due_date: date | None = None


class ReceiptLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    purchase_item_id: uuid.UUID
    quantity: Decimal


class ReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    reference: str
    purchase_order_id: uuid.UUID
    branch_id: uuid.UUID | None
    received_by: uuid.UUID | None
    received_at: datetime
    amount: Decimal
    lines: list[ReceiptLineRead]
    po_reference: str | None = None
    supplier_name: str | None = None
    currency_code: str | None = None
