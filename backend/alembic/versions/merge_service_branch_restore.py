"""Restore the missing services/branches migration bridge.

The branches migration already references this revision. Its original
predecessor was the final services migration, so preserve both revision IDs.
"""

revision: str = "merge_service_branch"
down_revision: str | None = "4152e08f713b"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
