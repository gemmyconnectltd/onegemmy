from sqlalchemy import Column, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.tenancy.models import TenantScopedMixin

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "permissions"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    resource: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions", lazy="selectin")


class Role(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_roles_tenant_name"),
    )

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    tenant = relationship("Tenant", back_populates="roles", lazy="joined")
    users = relationship("User", back_populates="role_rel", lazy="selectin")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles", lazy="selectin")
