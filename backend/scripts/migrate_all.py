"""
Run Alembic migrations on all configured databases.

Usage:
    uv run python -m scripts.migrate_all          # both DBs
    uv run python -m scripts.migrate_all --local  # local only
    uv run python -m scripts.migrate_all --neon   # neon only
"""
import asyncio
import sys
from alembic.config import Config
from alembic import command
from app.core.config import settings


def run_migrations(db_url: str, label: str) -> None:
    print(f"\n{'='*50}")
    print(f"  Running migrations on: {label}")
    print(f"{'='*50}")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")
    print(f"  ✓ {label} migrations complete")


def main() -> None:
    args = sys.argv[1:]
    run_local = "--neon" not in args
    run_neon = "--local" not in args

    if run_local:
        if not settings.DATABASE_URL:
            print("⚠ DATABASE_URL not set, skipping local DB")
        else:
            run_migrations(settings.DATABASE_URL, "Local DB")

    if run_neon:
        if not settings.DATABASE_NEON_URL:
            print("⚠ DATABASE_NEON_URL not set, skipping Neon DB")
        else:
            run_migrations(settings.DATABASE_NEON_URL, "Neon DB (Production)")

    print("\n✓ All migrations done!\n")


if __name__ == "__main__":
    main()
