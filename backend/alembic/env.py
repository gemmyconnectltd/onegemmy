import asyncio
from logging.config import fileConfig

from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.core.config import settings
from app.core.database import Base

# Import all models so they register on Base.metadata before autogenerate runs.
from app.modules.inventory.models import Brand, Category, Product, ProductVariant, Supplier, Unit  # noqa: F401
from app.modules.tenants.models import Branch, Department, Permission, Role, Tenant, User  # noqa: F401
from app.modules.sales.models import Customer, Deal, Order, OrderItem, Return, ReturnItem, Target  # noqa: F401
from app.modules.finance.models import Account, Transaction, TransactionLine, Budget, Expense  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(settings.DATABASE_URL)

    @event.listens_for(connectable.sync_engine, "begin")
    def _apply_search_path(conn: Connection) -> None:
        conn.exec_driver_sql("SET search_path TO public")

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
