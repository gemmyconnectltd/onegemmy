import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class AiConversation(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """One assistant conversation, private to the user who started it (and their tenant)."""

    __tablename__ = "ai_conversations"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module: Mapped[str] = mapped_column(String(40), nullable=False, default="general")
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="New conversation")

    messages = relationship("AiMessage", back_populates="conversation", lazy="select", cascade="all, delete-orphan",
                            order_by="AiMessage.created_at")

    __table_args__ = (Index("ix_ai_conversations_tenant_user", "tenant_id", "user_id", "updated_at"),)


class AiMessage(UUIDPKMixin, Base):
    """A turn. `content` is the validated reply payload (text, tables, links, tools used) — what the
    user saw — so history can be redrawn exactly without calling the provider again."""

    __tablename__ = "ai_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False,
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # user | assistant
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("AiConversation", back_populates="messages")

    __table_args__ = (Index("ix_ai_messages_conversation", "conversation_id", "created_at"),)


class AiUsageEvent(UUIDPKMixin, Base):
    """One AI request, for limits, cost monitoring and error monitoring. Holds no prompt text."""

    __tablename__ = "ai_usage_events"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    feature: Mapped[str] = mapped_column(String(40), nullable=False)       # chat | insights | ...
    module: Mapped[str] = mapped_column(String(40), nullable=False, default="general")
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False)        # ok | error | blocked
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    est_cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_ai_usage_tenant_created", "tenant_id", "created_at"),
        Index("ix_ai_usage_created", "created_at"),
    )


class AiAction(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A change the assistant PROPOSED. Nothing in the business data changes until the user confirms it
    (POST /ai/actions/{id}/confirm), which re-validates permissions, prices and business rules first."""

    __tablename__ = "ai_actions"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)          # invoice | purchase_order
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")  # pending|confirmed|cancelled
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)   # resolved ids + frozen prices
    preview: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)   # what the user was shown
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_ai_actions_tenant_user", "tenant_id", "user_id", "created_at"),)
