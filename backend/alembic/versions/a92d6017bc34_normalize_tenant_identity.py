"""Normalize tenant text and slugs, retaining every changed URL as an alias.

Revision ID: a92d6017bc34
Revises: e3a8c2d51f77
"""
import re
import unicodedata

import sqlalchemy as sa

from alembic import op

revision = "a92d6017bc34"
down_revision = "e3a8c2d51f77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "archived_at" not in {c["name"] for c in inspector.get_columns("tenants")}:
        op.add_column("tenants", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    if "tenant_slug_aliases" not in inspector.get_table_names():
        op.create_table(
            "tenant_slug_aliases",
            sa.Column("slug", sa.String(100), primary_key=True),
            sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        )
        op.create_index("ix_tenant_slug_aliases_tenant_id", "tenant_slug_aliases", ["tenant_id"])
    # Identity writes are serialized with application slug allocation. No financial rows change.
    conn.execute(sa.text("SELECT pg_advisory_xact_lock(18273491)"))
    rows = conn.execute(sa.text("SELECT id, name, slug FROM tenants ORDER BY created_at, id")).all()
    reserved = {r.slug: r.id for r in rows}
    reserved.update(dict(conn.execute(sa.text("SELECT slug, tenant_id FROM tenant_slug_aliases")).all()))
    for row in rows:
        value = row.slug.removeprefix("TEN-")
        value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
        base = re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value)).strip("-")[:90] or "business"
        slug, suffix = base, 1
        while slug in reserved and reserved[slug] != row.id:
            suffix += 1
            slug = f"{base}-{suffix}"
        if slug != row.slug:
            conn.execute(sa.text("INSERT INTO tenant_slug_aliases (slug, tenant_id) VALUES (:slug, :id) ON CONFLICT (slug) DO NOTHING"), {"slug": row.slug, "id": row.id})
            conn.execute(sa.text("UPDATE tenants SET slug=:slug WHERE id=:id"), {"slug": slug, "id": row.id})
            reserved[slug] = row.id
    for table, columns in {
        "tenants": ["name", "phone", "city", "country", "address", "website"],
        "users": ["full_name", "email", "phone"],
    }.items():
        for column in columns:
            # Re-running this data cleanup is safe; addresses are not lowercased or reassigned.
            conn.execute(sa.text(f"UPDATE {table} SET {column}=btrim({column}) WHERE {column} <> btrim({column})"))


def downgrade() -> None:
    # This intentionally non-destructive downgrade is paired with an idempotent upgrade.
    # Slugs stay normalized. Dropping aliases would break historical links, so preserve this additive
    # table and normalization on rollback. Old application versions still resolve canonical slugs.
    pass
