from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Branch(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "branches"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="active")
    # Exactly one branch per tenant has this set (enforced in the service
    # layer, not a DB constraint — see set_main_branch). It's the fallback
    # branch for orders/stock when a user has no branch of their own, and
    # the one branch that can never be deleted.
    is_main: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    tenant = relationship("Tenant", back_populates="branches", lazy="select")
    users = relationship("User", back_populates="branch_rel", lazy="selectin")
