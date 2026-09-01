# ruff: noqa: I001
# Import order below is load-bearing (see comment further down) — do not let
# `ruff --fix` re-sort it.
import asyncio
from logging.config import fileConfig

from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.core.config import settings
from app.core.database import Base
# Import all models so they register on Base.metadata before autogenerate runs.
# `sales` must be imported before `accounting`: Expense.order references the
# "Order" class by string name, and SQLAlchemy resolves it against whichever
# classes are registered at mapper-configuration time. Keep this block as-is
# (do not let `ruff --fix` re-alphabetize it — that reintroduces the failure).
from app.modules.audit.models import AuditLog  # noqa: F401
from app.modules.crm.models import Campaign, EmailLog  # noqa: F401
from app.modules.hr.models import (  # noqa: F401
    Applicant,
    Attendance,
    Employee,
    LeaveRequest,
    PayrollEntry,
)
from app.modules.inventory.models import (  # noqa: F401
    Brand,
    Category,
    InventoryBatch,
    Product,
    ProductSerial,
    ProductVariant,
    StockTransfer,
    StockTransferItem,
    Supplier,
    Unit,
    WarrantyClaim,
)
from app.modules.manufacturing.models import (  # noqa: F401
    BillOfMaterial,
    BillOfMaterialItem,
    ProductionItem,
    ProductionOrder,
)
from app.modules.procurement.models import PurchaseItem, PurchaseOrder  # noqa: F401
from app.modules.repairs.models import RepairJob, RepairJobPart  # noqa: F401
from app.modules.sales.models import (  # noqa: F401
    Customer,
    Deal,
    Order,
    OrderItem,
    Return,
    ReturnItem,
    Target,
)
from app.modules.tenants.models import (  # noqa: F401
    Branch,
    Department,
    Permission,
    Role,
    Tenant,
    User,
)
from app.modules.accounting.models import (  # noqa: F401
    Account,
    Budget,
    Expense,
    Transaction,
    TransactionLine,
)

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
