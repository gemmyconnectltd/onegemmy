import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.tenancy.models import TenantScopedMixin


class User(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),)

    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="member")
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)

    tenant = relationship("Tenant", back_populates="users", lazy="joined")
    role_rel = relationship("Role", back_populates="users", lazy="joined", foreign_keys=[role_id])
    shop_rel = relationship("Shop", back_populates="users", lazy="joined", foreign_keys=[shop_id])
    department_rel = relationship("Department", back_populates="users", lazy="joined", foreign_keys=[department_id])

    @property
    def permissions_names(self) -> list[str]:
        if self.role_rel and self.role_rel.permissions:
            return [p.name for p in self.role_rel.permissions]
        return []
