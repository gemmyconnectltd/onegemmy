import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.discounts.schemas import ManualDiscount
from app.modules.sales.schemas.customer import CustomerRead
from app.modules.sales.schemas.order_item import OrderItemCreate, OrderItemRead
from app.modules.sales.schemas.order_payment import OrderPaymentRead


class OrderPaymentEntry(BaseModel):
    """One payment taken at checkout. A sale paid with several methods (a split) sends one entry per method; the sale is still recorded once."""
    method: Literal["cash", "mobile", "card", "bank"]
    amount: float = Field(gt=0, allow_inf_nan=False)  # what is applied to this sale
    reference: str | None = Field(default=None, max_length=100)  # mobile-money / card transaction reference
    tendered: float | None = Field(default=None, ge=0, allow_inf_nan=False)  # cash handed over, when change is given


class OrderCreate(BaseModel):
    manual_discount_reason: str | None = Field(default=None, max_length=500)
    expected_pricing_hash: str | None = Field(default=None, min_length=64, max_length=64)
    coupon_codes: list[str] = Field(default_factory=list, max_length=5)
    manual_discount: ManualDiscount | None = None
    discount_approval_id: uuid.UUID | None = None
    pricing_channel: Literal["pos", "sales_order"] = "sales_order"
    customer_id: uuid.UUID | None = None
    # Who is responsible for the sale. Omit it and the person entering the sale is the salesperson.
    salesperson_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    status: str = "Pending"
    discount: float = Field(default=0, ge=0, allow_inf_nan=False)
    tax: float = 0
    notes: str | None = None
    client_order_id: str | None = None
    payment_method: str | None = None
    amount_tendered: float | None = None
    change_due: float | None = None
    # "Amount Paid Now" — what's actually applied to this invoice at
    # checkout, distinct from amount_tendered (cash physically handed over,
    # which can exceed this when change is given). None preserves the
    # historical default of "fully paid" so every existing caller (POS,
    # CSV import) keeps behaving exactly as before without sending this.
    amount_paid: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    # Transaction reference of the single checkout payment (mobile money / card).
    payment_reference: str | None = Field(default=None, max_length=100)
    # Several payments for one sale (a split, or a part payment taken in more than one method). Replaces payment_method / amount_paid.
    payments: list[OrderPaymentEntry] | None = Field(default=None, max_length=6)
    due_date: date | None = None
    ordered_at: datetime | None = None
    # Foreign-currency invoicing. Omit both (every existing client) for the tenant's base currency.
    # `exchange_rate` is units of the base currency per 1 unit of `currency_code`; omit it to use the
    # tenant/platform rate effective at the order date. It is frozen on the order when created.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)
    items: list[OrderItemCreate] = Field(default_factory=list, max_length=200)


class OrderBulkLine(BaseModel):
    """One line of a CSV order import. Lines sharing the same `order_reference`
    are grouped into a single order (client_order_id), so multi-item orders are
    one reference repeated. `status` defaults to Completed — importing historical
    sales as Completed deducts stock and posts them to accounting exactly like a
    POS sale; use Pending to record rows without touching stock or the ledger."""
    order_reference: str
    customer: str | None = None
    ordered_at: datetime | None = None
    status: str = "Completed"
    payment_method: str | None = None
    notes: str | None = None
    sku: str = ""
    quantity: float = 1
    unit_price: float


class OrderBulkCreate(BaseModel):
    items: list[OrderBulkLine]


class OrderBulkResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = []


class OrderUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    status: str | None = None
    discount: float | None = None
    tax: float | None = None
    notes: str | None = None
    payment_method: str | None = None
    amount_tendered: float | None = None
    change_due: float | None = None
    due_date: date | None = None
    # Owners/administrators only: moves the sale (and its sale journal) to another day, inside open periods.
    ordered_at: datetime | None = None
    # Only while the order is not yet Completed — a completed order's currency and rate are frozen.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


class OrderCorrection(BaseModel):
    """An owner's correction of a completed sale: the full set of lines it should have had, and why."""
    items: list[OrderItemCreate] = Field(min_length=1, max_length=200)
    discount: float = Field(default=0, ge=0, allow_inf_nan=False)
    customer_id: uuid.UUID | None = None
    notes: str | None = None
    reason: str = Field(min_length=3, max_length=500)


class OrderRead(BaseModel):
    discount_details: list[dict] = Field(default_factory=list)
    original_subtotal: float | None = None
    total_discount: float | None = None
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    order_number: str
    customer_id: uuid.UUID | None
    deal_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    created_by: uuid.UUID | None
    salesperson_id: uuid.UUID | None = None
    salesperson_name: str | None = None
    status: str
    subtotal: float
    discount: float
    tax: float
    total: float
    notes: str | None
    payment_method: str | None = None
    amount_tendered: float | None = None
    change_due: float | None = None
    ordered_at: datetime | None = None
    archived_at: datetime | None = None
    archive_reason: str | None = None
    customer: CustomerRead | None = None
    items: list[OrderItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # Credit sales / partial payments — amount_paid is the one stored,
    # authoritative running total; everything else here is derived from it
    # (never independently settable by a client, per the "users should not
    # manually select payment status" rule).
    amount_paid: float = 0
    due_date: date | None = None
    outstanding_balance: float = 0
    # Currency context. `subtotal`/`discount`/`tax`/`total`/`amount_paid`/`outstanding_balance` are in
    # `currency_code` (None on rows from before multi-currency = the tenant's base currency). `base_*`
    # are the tenant-base-currency values at the frozen `exchange_rate`.
    currency_code: str | None = None
    exchange_rate: Decimal | None = None
    base_subtotal: Decimal | None = None
    base_discount: Decimal | None = None
    base_tax: Decimal | None = None
    base_total: Decimal | None = None
    base_outstanding_balance: Decimal | None = None
    # Credit approval. status "Awaiting Approval" = a credit sale over the daily limit, held with nothing posted;
    # `requested_paid` is what the cashier took. approved_* record who completed or rejected it.
    requested_paid: Decimal | None = None
    credit_base: Decimal | None = None
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    approval_note: str | None = None
    held_reason: str | None = None
    payment_status: str = "Unpaid"  # Unpaid | PartiallyPaid | Paid
    is_overdue: bool = False
    payments: list[OrderPaymentRead] = []


class SalespersonChange(BaseModel):
    salesperson_id: uuid.UUID
    reason: str = Field(min_length=3, max_length=500)


class OrderDecision(BaseModel):
    """Body of the approve / reject endpoints."""
    note: str | None = Field(default=None, max_length=500)
