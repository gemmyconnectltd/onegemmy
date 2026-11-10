"""Authorized product detail and history orchestration."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import decide_read
from app.core.branches import branch_allowed, has_branch_restriction
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.filenames import content_disposition, document_filename
from app.core.period import DatePeriod
from app.modules.inventory.repository.history import ProductHistoryRepository
from app.modules.inventory.repository.product import ProductRepository
from app.modules.inventory.schemas.product import ProductRead
from app.modules.tenants.models import User
from app.modules.tenants.service.feature import resolve_modules


async def context(
    db: AsyncSession, user: User, product_id: uuid.UUID, branch_id: uuid.UUID | None = None
) -> tuple:
    product = await ProductRepository(db).get_by_id_for_tenant(user.tenant_id, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    if branch_id and not branch_allowed(user, branch_id):
        raise ForbiddenError("This branch is not assigned to your account")
    if branch_id:
        from app.modules.tenants.repository import BranchRepository

        if await BranchRepository(db).get_by_id_for_tenant(user.tenant_id, branch_id) is None:
            raise NotFoundError("Branch not found")
    branches = None
    if has_branch_restriction(user):
        branches = [
            uuid.UUID(str(id))
            for id in (user.branch_ids if user.branch_ids is not None else [user.branch_id])
            if id
        ]
    states = await resolve_modules(db, user.tenant_id)
    modules = {
        key
        for key in ("sales", "procurement")
        if states.get(key) in ("enabled", "available")
        and key not in (user.disabled_modules or [])
        and (
            user.is_superuser
            or user.role in ("owner", "admin")
            or decide_read(key, "", user.permissions_names)[0]
        )
    }
    return product, branches, modules


async def product_history(
    db: AsyncSession,
    user: User,
    product_id: uuid.UUID,
    period: DatePeriod,
    offset: int = 0,
    limit: int = 20,
    category: str = "all",
    kind: str | None = None,
    search: str | None = None,
    actor_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
) -> dict:
    _, branches, modules = await context(db, user, product_id, branch_id)
    repo = ProductHistoryRepository(db)
    events = repo.events(user.tenant_id, product_id, modules)
    stmt = repo.filtered(events, branches, period, search, actor_id, branch_id)
    result = await repo.page(stmt, category, kind, offset, limit)
    await repo.labels(user.tenant_id, result["items"])
    return result


async def product_details(
    db: AsyncSession, user: User, product_id: uuid.UUID, branch_id: uuid.UUID | None = None
) -> dict:
    product, branches, modules = await context(db, user, product_id, branch_id)
    repo = ProductHistoryRepository(db)
    sold = None
    if "sales" in modules:
        # A sales KPI must not depend on unrelated procurement/audit schemas or scans.
        events = repo.events(user.tenant_id, product_id, {"sales"}, sales_only=True)
        stmt = repo.filtered(events, branches, DatePeriod(), None, None, branch_id)
        sold = await repo.sold(stmt)
    data = ProductRead.model_validate(product).model_dump()
    # A global balance must never masquerade as stock at an employee's branch.
    stock = sum((v.stock for v in product.variants), 0) if product.has_variants else product.stock
    return {
        "product": data,
        "current_stock": stock if branches is None and branch_id is None else None,
        "stock_scope": "business",
        "total_sold": sold,
        "modules": sorted(modules),
        "limitations": [
            "Stock is maintained business-wide; branch balances and reservations are not recorded.",
            "Legacy transactions do not record previous/resulting stock or all posting timestamps. Unknown values remain blank.",
            "Total sold is completed sales less approved customer returns in the authorized scope.",
        ],
    }


async def _business_name(db, tenant_id) -> str | None:
    from sqlalchemy import select

    from app.modules.tenants.models import Tenant
    return (await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))).scalar_one_or_none()


async def history_export(
    db: AsyncSession,
    user: User,
    product_id: uuid.UUID,
    period: DatePeriod,
    category: str,
    kind: str | None,
    search: str | None,
    actor_id: uuid.UUID | None,
    branch_id: uuid.UUID | None,
):
    """Authorize before starting the response, then stream bounded SQL batches."""
    import csv
    import io

    from fastapi.responses import StreamingResponse

    product, branches, modules = await context(db, user, product_id, branch_id)
    repo = ProductHistoryRepository(db)
    events = repo.events(user.tenant_id, product_id, modules)
    filtered = repo.filtered(events, branches, period, search, actor_id, branch_id).subquery()
    stmt = repo.selection(filtered, category, kind).order_by(
        filtered.c.occurred_at.desc(), filtered.c.id.desc()
    )

    async def chunks():
        def cell(value):
            text = str(value) if value is not None else ""
            return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "Timestamp",
                "Product",
                "Activity",
                "Branch",
                "Destination",
                "Reference",
                "Status",
                "Quantity",
                "Stock change",
                "Stock before",
                "Stock after",
                "Old price",
                "New price",
                "Old cost",
                "New cost",
                "Performed by",
            ]
        )
        yield "\ufeff" + buffer.getvalue()
        result = await db.stream(stmt.execution_options(yield_per=200))
        try:
            async for batch in result.mappings().partitions(200):
                rows = [dict(row) for row in batch]
                await repo.labels(user.tenant_id, rows)
                buffer.seek(0)
                buffer.truncate()
                for row in rows:
                    changes = row["details"].get("changes") or {}
                    before, after = changes.get("before") or {}, changes.get("after") or {}
                    writer.writerow(
                        [
                            cell(v)
                            for v in [
                                row["occurred_at"],
                                product.name,
                                row["details"].get("summary") or row["type"],
                                row["branch"],
                                row["other_branch"],
                                row["reference"],
                                row["status"],
                                row["quantity"],
                                row["quantity_change"],
                                before.get("stock"),
                                after.get("stock"),
                                before.get("price"),
                                after.get("price"),
                                before.get("cost"),
                                after.get("cost"),
                                row["actor"],
                            ]
                        ]
                    )
                yield buffer.getvalue()
        finally:
            await result.close()

    return StreamingResponse(
        chunks(),
        media_type="text/csv",
        headers={"Content-Disposition": content_disposition(document_filename(
            await _business_name(db, user.tenant_id), f"Product History {product.name}", "csv"))},
    )
