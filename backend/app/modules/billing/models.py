import uuid
from datetime import date, datetime
from typing import ClassVar

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class BillingTimestamp(TimestampMixin):
    __mapper_args__: ClassVar[dict] = {"eager_defaults": True}


class BillingPlan(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_plans"
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (CheckConstraint("status IN ('draft','active','archived')"),)


class BillingPrice(UUIDPKMixin, BillingTimestamp, Base):
    """Immutable price AND entitlement agreement. Every edit appends a version."""

    __tablename__ = "billing_prices"
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("billing_plans.id"))
    version: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    terms: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        UniqueConstraint("plan_id", "version", "currency"),
        UniqueConstraint("plan_id", "id"),
    )


class BillingSubscription(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_subscriptions"
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="RESTRICT"), unique=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("billing_plans.id"))
    price_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("billing_prices.id"))
    cycle: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3))
    terms: Mapped[dict] = mapped_column(JSONB)
    seats: Mapped[int] = mapped_column(Integer)
    branches: Mapped[int] = mapped_column(Integer)
    recurring: Mapped[int] = mapped_column(BigInteger)
    recurring_net: Mapped[int] = mapped_column(BigInteger)
    credit: Mapped[int] = mapped_column(BigInteger, default=0)
    discount_bps: Mapped[int] = mapped_column(Integer, default=0)
    next_discount_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    billing_anchor_day: Mapped[int] = mapped_column(Integer)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    trial_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_at_end: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(
            ["plan_id", "price_id"], ["billing_prices.plan_id", "billing_prices.id"]
        ),
        Index("ix_billing_sub_status_plan_currency", "status", "plan_id", "currency"),
        CheckConstraint("recurring >= 0 AND seats >= 0 AND branches >= 0"),
        CheckConstraint("cycle IN ('monthly','annual')"),
        CheckConstraint("discount_bps BETWEEN 0 AND 10000"),
    )


class BillingInvoice(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_invoices"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"))
    subscription_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("billing_subscriptions.id"))
    bill_to: Mapped[str] = mapped_column(String(255))
    currency_decimals: Mapped[int] = mapped_column(Integer)
    number: Mapped[str] = mapped_column(String(60), unique=True)
    source_key: Mapped[str] = mapped_column(String(150), unique=True)
    currency: Mapped[str] = mapped_column(String(3))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open")
    lines: Mapped[list] = mapped_column(JSONB)
    subtotal: Mapped[int] = mapped_column(BigInteger)
    tax: Mapped[int] = mapped_column(BigInteger)
    total: Mapped[int] = mapped_column(BigInteger)
    paid: Mapped[int] = mapped_column(BigInteger, default=0)
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(
            ["tenant_id", "subscription_id"],
            ["billing_subscriptions.tenant_id", "billing_subscriptions.id"],
        ),
        Index("ix_billing_inv_tenant_created", "tenant_id", "created_at"),
        Index("ix_billing_inv_tenant_status", "tenant_id", "status", "due_at"),
        CheckConstraint("total >= 0 AND paid >= 0 AND paid <= total AND tax >= 0"),
    )


class BillingPayment(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_payments"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"))
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("billing_invoices.id"))
    reference: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, default=uuid.uuid4
    )
    provider_ref: Mapped[str | None] = mapped_column(String(150), unique=True)
    provider: Mapped[str] = mapped_column(String(30), default="pawapay")
    method: Mapped[str] = mapped_column(String(60), default="mobile_money")
    amount: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    provider_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(
            ["tenant_id", "invoice_id"], ["billing_invoices.tenant_id", "billing_invoices.id"]
        ),
        Index("ix_billing_pay_tenant_invoice", "tenant_id", "invoice_id", "created_at"),
        Index("ix_billing_pay_tenant_created", "tenant_id", "created_at"),
        Index("ix_billing_pay_status_created", "status", "created_at"),
        CheckConstraint("amount > 0"),
    )


class BillingQuote(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_quotes"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    request: Mapped[dict] = mapped_column(JSONB)
    preview: Mapped[dict] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (Index("ix_billing_quote_tenant_created", "tenant_id", "created_at"),)


class BillingOperation(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_operations"
    scope: Mapped[str] = mapped_column(String(120))
    key: Mapped[str] = mapped_column(String(100))
    fingerprint: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (UniqueConstraint("scope", "key"),)


class BillingSetting(Base):
    __tablename__ = "billing_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class BillingNotice(UUIDPKMixin, BillingTimestamp, Base):
    __tablename__ = "billing_notices"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"))
    event_key: Mapped[str] = mapped_column(String(180), unique=True)
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(2000))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BillingReport(Base):
    __tablename__ = "billing_reports"
    key: Mapped[str] = mapped_column(String(180), primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BillingDaily(Base):
    __tablename__ = "billing_daily"
    from datetime import date

    from sqlalchemy import Date

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    currency: Mapped[str] = mapped_column(String(3), primary_key=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    subscription_status: Mapped[str] = mapped_column(String(20), primary_key=True)
    invoice_count: Mapped[int] = mapped_column(BigInteger, default=0)
    outstanding: Mapped[int] = mapped_column(BigInteger, default=0)
    successful_payments: Mapped[int] = mapped_column(BigInteger, default=0)
    failed_payments: Mapped[int] = mapped_column(BigInteger, default=0)
    successful_amount: Mapped[int] = mapped_column(BigInteger, default=0)


class BillingRefund(UUIDPKMixin, BillingTimestamp, Base):
    """Append-only credit note and cash return; original invoice/payment remain unchanged."""

    __tablename__ = "billing_refunds"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"))
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("billing_payments.id"))
    reference: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, default=uuid.uuid4
    )
    number: Mapped[str] = mapped_column(String(60), unique=True)
    amount: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reason: Mapped[str] = mapped_column(String(500))
    document: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "payment_id"], ["billing_payments.tenant_id", "billing_payments.id"]
        ),
        Index("ix_billing_refund_tenant_created", "tenant_id", "created_at"),
        Index("ix_billing_refund_payment_status", "payment_id", "status"),
        CheckConstraint("amount > 0"),
    )
