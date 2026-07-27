import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class TenantScopedMixin:
    """Mixin for any table whose rows belong to a single tenant.

    Shared-tables multi-tenancy: one database, every tenant-owned table
    carries a tenant_id column. Simpler to operate than schema/DB-per-tenant;
    revisit only if a customer needs hard data isolation.
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
