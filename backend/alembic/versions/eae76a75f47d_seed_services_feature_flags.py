"""seed services feature flags

Revision ID: eae76a75f47d
Revises: e6c78e180752
Create Date: 2026-09-29 16:42:04.102941

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'eae76a75f47d'
down_revision: str | None = 'c37169a80ee5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Unlike the platform's original 7 modules (all default_enabled=true —
    # every tenant got them from day one), Services starts opt-in: it's only
    # relevant to appointment/walk-in businesses, so an existing retail or
    # manufacturing tenant shouldn't suddenly see a new nav item appear.
    # A new signup gets it turned on automatically when they pick
    # "Service-based" or "Mixed" at registration (see auth.service.register);
    # everyone else opts in per-tenant via the existing Features & Access
    # admin panel, same as any other feature override.
    op.execute(sa.text("""
        INSERT INTO feature_flags (id, key, name, module, description, default_enabled, is_active) VALUES
        ('1d70519c-dbfe-4c7e-8cb3-e97fa3347ec2', 'services', 'Services', 'services',
         'Appointment-based and walk-in service operations — catalog, staff assignment, commissions', false, true),
        ('c9441da3-cfb8-4d8c-bd83-cfdb27696ddd', 'appointments', 'Appointments', 'services',
         'Scheduled bookings with check-in, staff assignment and calendar', false, true),
        ('10262841-6545-481e-8940-44a8825d6058', 'queue', 'Walk-in Queue', 'services',
         'Fast walk-in intake for service businesses without a booking', false, true)
    """))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM feature_flags WHERE key IN ('services', 'appointments', 'queue')"
    ))
