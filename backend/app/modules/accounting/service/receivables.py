import uuid

from sqlalchemy.ext.asyncio import AsyncSession


async def get_receivables_summary(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Accounts Receivable belongs in Accounting per the credit-sales spec,
    but the underlying figures live on sales_orders — imported locally
    (like backfill_sale_transactions does) to avoid a module-load-time
    circular import between accounting and sales."""
    from app.modules.sales.repository import OrderRepository

    return await OrderRepository(db).receivables_summary(tenant_id)
