import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # The person's own contact number. Distinct from Tenant.phone, which is
    # the business's main line (signup collects that one, see
    # app.modules.auth.schemas.RegisterRequest).
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="member")
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=True
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    # Stamped on every successful login so the users screen can show "last
    # seen" without scanning the audit trail.
    last_login: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # Every list/sort path on the users screen filters by tenant first.
        Index("ix_users_tenant_created", "tenant_id", "created_at"),
        Index("ix_users_tenant_active", "tenant_id", "is_active"),
    )

    tenant = relationship("Tenant", back_populates="users", lazy="select")
    role_rel = relationship("Role", back_populates="users", lazy="select", foreign_keys=[role_id])
    branch_rel = relationship("Branch", back_populates="users", lazy="select", foreign_keys=[branch_id])
    department_rel = relationship("Department", back_populates="users", lazy="select", foreign_keys=[department_id])

    @property
    def permissions_names(self) -> list[str]:
        if self.role_rel and self.role_rel.permissions:
            return [p.name for p in self.role_rel.permissions]
        return []
