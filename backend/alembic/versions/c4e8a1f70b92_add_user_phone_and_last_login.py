"""add user phone, last_login and user-screen indexes

Revision ID: c4e8a1f70b92
Revises: de3538efbd00
Create Date: 2026-09-27 10:12:04.118374

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c4e8a1f70b92'
down_revision: str | None = 'de3538efbd00'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `users.phone` is the person's own contact number. It is NOT a rename of
    # `tenants.phone` (the business's main line, already collected at signup)
    # — that column is untouched and both are surfaced side by side on the
    # profile screen.
    op.add_column("users", sa.Column("phone", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))

    # The users screen lists and sorts by tenant first, and filters on
    # is_active for the Active/Inactive toggle.
    op.create_index("ix_users_tenant_created", "users", ["tenant_id", "created_at"], unique=False)
    op.create_index("ix_users_tenant_active", "users", ["tenant_id", "is_active"], unique=False)

    # Backs "View user activity" — one user's history within one tenant.
    op.create_index(
        "ix_audit_logs_tenant_actor_created",
        "audit_logs",
        ["tenant_id", "actor_user_id", "created_at"],
        unique=False,
    )

    # NOTE: the users table carries a model/migration drift on `email` that is
    # deliberately left alone here. The model declares a global
    # `unique=True`, while d364f20f23e8_initial.py created the composite
    # `uq_users_tenant_email` plus a non-unique `ix_users_email`. Service
    # layer (tenants.service.create_user) already rejects duplicate emails
    # platform-wide via get_user_by_email_global, so the application-level
    # guarantee holds; reconciling the physical constraints is a separate
    # data-migration decision and is not safe to fold into this one.


def downgrade() -> None:
    op.drop_index("ix_audit_logs_tenant_actor_created", table_name="audit_logs")
    op.drop_index("ix_users_tenant_active", table_name="users")
    op.drop_index("ix_users_tenant_created", table_name="users")
    op.drop_column("users", "last_login")
    op.drop_column("users", "phone")
