from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Role(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_roles_tenant_name"),
    )

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    tenant = relationship("Tenant", back_populates="roles", lazy="select")
    users = relationship("User", back_populates="role_rel", lazy="noload")
    permissions = relationship("Permission", secondary="role_permissions", back_populates="roles", lazy="selectin")
