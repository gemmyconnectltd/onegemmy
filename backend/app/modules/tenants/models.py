from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.tenancy.models import TenantScopedMixin


class Department(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_departments_tenant_name"),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    users = relationship("User", back_populates="department_rel", lazy="selectin")


class Shop(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "shops"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="active")

    users = relationship("User", back_populates="shop_rel", lazy="selectin")


class Tenant(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    logo_url: Mapped[str | None] = mapped_column(String(500))
    website: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))

    subscription_plan: Mapped[str] = mapped_column(String(50), default="free")
    subscription_status: Mapped[str] = mapped_column(String(50), default="active")

    users = relationship("User", back_populates="tenant", lazy="selectin")
    roles = relationship("Role", back_populates="tenant", lazy="selectin")
    shops = relationship("Shop", back_populates="tenant", lazy="selectin")
    departments = relationship("Department", back_populates="tenant", lazy="selectin")


Department.tenant = relationship("Tenant", back_populates="departments", lazy="joined")
Shop.tenant = relationship("Tenant", back_populates="shops", lazy="joined")
