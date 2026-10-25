"""seed the public pricing plans (Launch, Starter, Growth, Professional) — once

Revision ID: f9c3d7a52e18
Revises: e7a1b5c93d06

Runs with the normal deployment (`alembic upgrade head`) and therefore exactly once. It only inserts when there are NO
billing plans yet, so it never overwrites or duplicates prices an admin has already created. Amounts are currency minor
units (RWF has no decimals; USD is in cents). Annual price = 12 months less 20%. After this, plans and prices are managed
in Super Admin → Plans & Billing, and the website reads them live from the database.
"""
import json
import uuid

import sqlalchemy as sa

from alembic import op

revision = "f9c3d7a52e18"
down_revision = "e7a1b5c93d06"
branch_labels = None
depends_on = None

ANNUAL_DISCOUNT_PERCENT = 20

# name, description, monthly price per currency (minor units), users (included, max), branches (included, max), module keys
PLANS = [
    ("Launch", "Sales and micro-businesses starting out", {"RWF": 15000, "USD": 3000}, (1, 1), (1, 1), ["sales", "inventory"]),
    ("Starter", "Small businesses with a few staff and branches", {"RWF": 45000, "USD": 5000}, (4, 4), (3, 3), ["sales", "inventory", "procurement", "crm"]),
    ("Growth", "Growing businesses with a team and several branches", {"RWF": 125000, "USD": 10000}, (5, 20), (2, None), ["sales", "inventory", "procurement", "crm", "accounting", "hr"]),
    ("Professional", "Established businesses with larger teams", {"RWF": 250000, "USD": 20000}, (21, 100), (2, None),
     ["sales", "inventory", "procurement", "crm", "accounting", "hr", "manufacturing", "services", "appointments", "queue"]),
]


def annual(monthly: int) -> int:
    return monthly * 12 * (100 - ANNUAL_DISCOUNT_PERCENT) // 100


def seed_plans(conn: sa.engine.Connection, *, force: bool = False) -> int:
    """Inserts the plans if (and only if) the catalogue is empty (`force` is for tests). Returns how many plans were created."""
    if not force and conn.execute(sa.text("SELECT count(*) FROM billing_plans")).scalar_one():
        return 0
    currencies = {r[0] for r in conn.execute(sa.text("SELECT code FROM currencies WHERE is_active"))}
    flags = {r[0] for r in conn.execute(sa.text("SELECT key FROM feature_flags WHERE is_active"))}
    created = 0
    for name, description, prices, users, branches, modules in PLANS:
        offered = {c: m for c, m in prices.items() if c in currencies}
        if not offered:
            continue
        plan_id = uuid.uuid4()
        conn.execute(sa.text("INSERT INTO billing_plans (id, name, description, status, version) VALUES (:id, :n, :d, 'active', 1)"), {"id": plan_id, "n": name, "d": description})
        for currency, monthly in offered.items():
            terms = {
                "currency": currency, "monthly": monthly, "annual": annual(monthly), "seat_monthly": 0, "branch_monthly": 0,
                "included_users": users[0], "included_branches": branches[0], "max_users": users[1], "max_branches": branches[1],
                "max_products": None, "max_storage_mb": None, "modules": [m for m in modules if m in flags], "trial_days": 0, "tax_bps": 0, "bill_active_users": False,
            }
            conn.execute(sa.text("INSERT INTO billing_prices (id, plan_id, version, currency, terms) VALUES (:id, :p, 1, :c, CAST(:t AS jsonb))"),
                         {"id": uuid.uuid4(), "p": plan_id, "c": currency, "t": json.dumps(terms)})
        created += 1
    return created


def upgrade() -> None:
    seed_plans(op.get_bind())


def downgrade() -> None:
    # Billing history is immutable (a trigger forbids deleting plans and prices), so a downgrade archives the seeded plans
    # instead — and only those nobody is subscribed to.
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE billing_plans p SET status = 'archived' WHERE p.name = ANY(:n) AND p.version = 1 AND p.status = 'active' "
        "AND NOT EXISTS (SELECT 1 FROM billing_subscriptions s WHERE s.plan_id = p.id)"), {"n": [p[0] for p in PLANS]})
