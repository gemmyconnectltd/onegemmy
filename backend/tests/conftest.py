"""Shared test fixtures.

`db` gives a real AsyncSession against the app's Postgres database **inside a transaction that is always
rolled back** — nothing a test writes ever persists, so it is safe on a dev database. Service-level
`commit()` calls only release a SAVEPOINT. If the database is unreachable, or its schema is behind the
code, the missing migrations are applied *inside that same transaction* (and rolled back with it); tests
marked `db` are skipped when neither is possible.
"""
import importlib.util
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

import app.main  # noqa: F401  (imports every module so all ORM models/relationships are registered)
from app.core.config import settings
from app.core.database import _json_serializer

BACKEND = Path(__file__).resolve().parent.parent


def pytest_configure(config):
    config.addinivalue_line("markers", "db: needs the app's Postgres database (runs in a rolled-back transaction)")


def _apply_pending_migrations(sync_conn) -> None:
    """Bring the schema up to head inside the open transaction. Migrations that need autocommit
    (CREATE INDEX CONCURRENTLY) are skipped — they only add indexes."""
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    ctx = MigrationContext.configure(sync_conn)
    current = ctx.get_current_revision()
    head = script.get_current_head()
    if current == head:
        return
    pending = [r for r in script.iterate_revisions(head, current) if r.revision != current]
    with Operations.context(ctx):
        for rev in reversed(pending):
            source = Path(rev.path).read_text()
            if "autocommit_block" in source:
                continue
            spec = importlib.util.spec_from_file_location(f"_mig_{rev.revision}", rev.path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            # Each in its own SAVEPOINT: a database that was partly migrated outside alembic can make an
            # old data-seeding migration collide with rows that already exist — skip it, keep going.
            sp = sync_conn.begin_nested()
            try:
                module.upgrade()
                sp.commit()
            except Exception:
                sp.rollback()
                if rev.revision == head:
                    raise


@pytest.fixture
async def db_conn():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool, json_serializer=_json_serializer)
    try:
        conn = await engine.connect()
    except Exception as exc:  # noqa: BLE001
        await engine.dispose()
        pytest.skip(f"database not reachable: {exc}")
    trans = await conn.begin()
    try:
        await conn.run_sync(_apply_pending_migrations)
    except Exception as exc:  # noqa: BLE001
        await trans.rollback()
        await conn.close()
        await engine.dispose()
        pytest.skip(f"could not bring the test schema up to date: {exc}")
    try:
        yield conn
    finally:
        await trans.rollback()
        await conn.close()
        await engine.dispose()


@pytest.fixture
async def db(db_conn):
    session = AsyncSession(bind=db_conn, expire_on_commit=False, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        await session.close()
