"""Which warehouse a branch sells from, and which warehouses a person may see.

One rule, used by the POS, by completing a sale and by the stock ledger:

* A branch sells from **its own warehouse**. When it has several, it sells from the business's default warehouse if that one belongs to the
  branch, otherwise from the branch's oldest active warehouse.
* A branch with no warehouse of its own sells from the business's **default warehouse** ("sales without a warehouse of their own are taken
  from the default").
* A business that has not switched warehouses on has one stock figure per product; none of this applies.

People limited to some branches see the warehouses of those branches, plus the default warehouse for any of their branches that has none
(that is where their sales come from). Owners and people with access to every branch see the whole business.
"""
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.models.warehouse import StockMovement, Warehouse

ZERO = Decimal(0)


def restricted_branches(user: Any) -> list[uuid.UUID] | None:
    """The branches a person is limited to, or None when they may see every branch (owners, administrators, "all branches" staff)."""
    if getattr(user, "is_superuser", False):
        return None
    ids = getattr(user, "branch_ids", None)
    if ids is None:
        ids = [user.branch_id] if getattr(user, "branch_id", None) else None
    return None if ids is None else [uuid.UUID(str(i)) for i in ids if i]


async def _warehouses(db: AsyncSession, tenant_id: uuid.UUID, *, active_only: bool) -> list[Any]:
    stmt = select(Warehouse.id, Warehouse.branch_id, Warehouse.is_default, Warehouse.is_active).where(Warehouse.tenant_id == tenant_id)
    if active_only:
        stmt = stmt.where(Warehouse.is_active.is_(True))
    return list((await db.execute(stmt.order_by(Warehouse.is_default.desc(), Warehouse.created_at))).all())


def _selling(rows: list[Any], branch_id: uuid.UUID | None) -> uuid.UUID | None:
    if not rows:
        return None
    own = [r for r in rows if branch_id is not None and r.branch_id == branch_id]  # rows are default-first, then oldest first
    if own:
        return own[0].id
    return next((r.id for r in rows if r.is_default), rows[0].id)


async def selling_warehouse(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID | None) -> uuid.UUID | None:
    """The warehouse a sale in this branch takes stock from. None when the business does not use warehouses."""
    return _selling(await _warehouses(db, tenant_id, active_only=True), branch_id)


async def visible_warehouses(db: AsyncSession, user: Any) -> set[uuid.UUID] | None:
    """The warehouses this person may see; None means all of them (or the business has no warehouses)."""
    mine = restricted_branches(user)
    if mine is None or user.tenant_id is None:
        return None
    return await warehouses_for_branches(db, user.tenant_id, mine)


async def warehouses_for_branches(db: AsyncSession, tenant_id: uuid.UUID, mine: list[uuid.UUID]) -> set[uuid.UUID] | None:
    """The warehouses holding these branches' stock (a branch without its own active warehouse sells from the one that
    serves it); None when the business has no warehouses, meaning the business-wide figures apply."""
    rows = await _warehouses(db, tenant_id, active_only=False)
    if not rows:
        return None
    seen = {r.id for r in rows if r.branch_id in mine}
    active = [r for r in rows if r.is_active]
    for branch in mine:
        if not any(r.branch_id == branch for r in active):
            fallback = _selling(active, branch)
            if fallback:
                seen.add(fallback)
    return seen


async def stock_in(db: AsyncSession, tenant_id: uuid.UUID, warehouse_ids: set[uuid.UUID] | list[uuid.UUID]) -> dict[tuple[uuid.UUID, uuid.UUID | None], Decimal]:
    """{(product, variant): quantity on hand} summed over the given warehouses, from the stock ledger."""
    if not warehouse_ids:
        return {}
    rows = (await db.execute(select(StockMovement.product_id, StockMovement.variant_id, func.sum(StockMovement.quantity))
                             .where(StockMovement.tenant_id == tenant_id, StockMovement.warehouse_id.in_(list(warehouse_ids)))
                             .group_by(StockMovement.product_id, StockMovement.variant_id))).all()
    return {(p, v): Decimal(str(q or 0)) for p, v, q in rows}


def apply_stock(products: list[Any], stock: dict[tuple[uuid.UUID, uuid.UUID | None], Decimal]) -> None:
    """Replace each product's (and variant's) business-wide stock with the given per-warehouse figures, in place."""
    for p in products:
        variants = getattr(p, "variants", None) or []
        for v in variants:
            v.stock = float(stock.get((p.id, v.id), ZERO))
        own = stock.get((p.id, None), ZERO)
        p.stock = float(own + sum((stock.get((p.id, v.id), ZERO) for v in variants), ZERO)) if variants else float(own)
