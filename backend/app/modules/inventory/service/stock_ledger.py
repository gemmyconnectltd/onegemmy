"""The stock ledger: where stock is, and how it got there.

`Product.stock` / `ProductVariant.stock` stay the one total for the business, and every service keeps changing it exactly as before.
For a business that has warehouses, a flush hook turns each change of that total into ledger movements, so the per-warehouse quantities
always add up to the total (less whatever is on a truck between two warehouses). Nothing keeps a second balance: a warehouse's quantity
is the sum of its movements.

A business with no warehouse is untouched: no rows are written for it until it creates its first warehouse.
"""
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import event, func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core import stock_context
from app.core.exceptions import ValidationError
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.models.warehouse import StockMovement, Warehouse

ZERO = Decimal(0)
Key = tuple[uuid.UUID, uuid.UUID | None]  # (product, variant)


def _dec(value) -> Decimal:
    return Decimal(str(value if value is not None else 0))


# ── Reading balances ─────────────────────────────────────────────────────────

async def balances(db: AsyncSession, tenant_id: uuid.UUID, warehouse_id: uuid.UUID | None = None) -> dict[tuple[uuid.UUID, uuid.UUID, uuid.UUID | None], Decimal]:
    """{(warehouse, product, variant): quantity on hand}, from the ledger."""
    stmt = select(StockMovement.warehouse_id, StockMovement.product_id, StockMovement.variant_id, func.sum(StockMovement.quantity)).where(StockMovement.tenant_id == tenant_id)
    if warehouse_id:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    rows = (await db.execute(stmt.group_by(StockMovement.warehouse_id, StockMovement.product_id, StockMovement.variant_id))).all()
    return {(w, p, v): _dec(q) for w, p, v, q in rows}


def _balance_sync(session: Session, tenant_id: uuid.UUID, warehouse_id: uuid.UUID, key: Key) -> Decimal:
    product_id, variant_id = key
    stmt = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
        StockMovement.tenant_id == tenant_id, StockMovement.warehouse_id == warehouse_id, StockMovement.product_id == product_id,
        StockMovement.variant_id.is_(None) if variant_id is None else StockMovement.variant_id == variant_id)
    return _dec(session.execute(stmt).scalar_one())


# ── Warehouses a business has ────────────────────────────────────────────────

async def has_warehouses(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    return (await db.execute(select(Warehouse.id).where(Warehouse.tenant_id == tenant_id).limit(1))).first() is not None


async def ensure_default_warehouse(db: AsyncSession, tenant_id: uuid.UUID) -> Warehouse:
    """The first time a business uses warehouses it gets a Main warehouse holding everything it already has, so the ledger starts equal to its books."""
    existing = (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id, Warehouse.is_default.is_(True)))).unique().scalar_one_or_none()
    if existing is not None:
        return existing
    if await has_warehouses(db, tenant_id):
        first = (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id).order_by(Warehouse.created_at))).unique().scalars().first()
        first.is_default = True
        await db.flush()
        return first
    from app.modules.tenants.repository import BranchRepository
    main = await BranchRepository(db).get_main_for_tenant(tenant_id)
    warehouse = Warehouse(tenant_id=tenant_id, code="MAIN", name="Main warehouse", branch_id=main.id if main else None, is_default=True, is_active=True)
    db.add(warehouse)
    await db.flush()
    opening: list[StockMovement] = []
    for product_id, stock in (await db.execute(select(Product.id, Product.stock).where(Product.tenant_id == tenant_id, Product.stock != 0))).all():
        opening.append(_movement(tenant_id, warehouse.id, product_id, None, _dec(stock), "opening", note="Stock on hand when warehouses were switched on"))
    for product_id, variant_id, stock in (await db.execute(
            select(ProductVariant.product_id, ProductVariant.id, ProductVariant.stock).join(Product, Product.id == ProductVariant.product_id)
            .where(Product.tenant_id == tenant_id, ProductVariant.stock != 0))).all():
        opening.append(_movement(tenant_id, warehouse.id, product_id, variant_id, _dec(stock), "opening", note="Stock on hand when warehouses were switched on"))
    db.add_all(opening)
    await db.flush()
    return warehouse


def _movement(tenant_id, warehouse_id, product_id, variant_id, quantity: Decimal, movement_type: str, *, reference_type=None, reference_id=None,
              reference_number=None, note=None, user_id=None) -> StockMovement:
    return StockMovement(tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id, variant_id=variant_id, quantity=quantity,
                         movement_type=movement_type, reference_type=reference_type, reference_id=reference_id, reference_number=reference_number,
                         note=note, user_id=user_id if user_id is not None else stock_context.current_user_id.get())


# ── The flush hook: every change of a stock total becomes ledger movements ───

def _pending_changes(session: Session) -> list[tuple[Key, uuid.UUID, Decimal]]:
    """(product/variant, tenant, change in the total) for everything this flush changes."""
    changes: list[tuple[Key, uuid.UUID, Decimal]] = []
    for obj in list(session.dirty):
        if not isinstance(obj, (Product, ProductVariant)):
            continue
        hist = inspect(obj).attrs.stock.history
        if not hist.has_changes() or not hist.deleted:
            continue
        delta = _dec(hist.added[0]) - _dec(hist.deleted[0])
        if delta == 0:
            continue
        if isinstance(obj, Product):
            changes.append(((obj.id, None), obj.tenant_id, delta))
        else:
            tenant = session.execute(select(Product.tenant_id).where(Product.id == obj.product_id)).scalar_one()
            changes.append(((obj.product_id, obj.id), tenant, delta))
    for obj in list(session.new):  # a product created with stock opens with that stock
        if isinstance(obj, Product) and _dec(obj.stock) != 0:
            changes.append(((obj.id, None), obj.tenant_id, _dec(obj.stock)))
        elif isinstance(obj, ProductVariant) and _dec(obj.stock) != 0:
            tenant = session.execute(select(Product.tenant_id).where(Product.id == obj.product_id)).scalar_one_or_none()
            if tenant is not None:
                changes.append(((obj.product_id, obj.id), tenant, _dec(obj.stock)))
    return changes


def _pick_warehouse(session: Session, tenant_id: uuid.UUID, reason: stock_context.StockReason | None) -> tuple[uuid.UUID | None, list[uuid.UUID]]:
    """(the warehouse to use first, the others to fall back on). None when the business has no warehouse."""
    rows = session.execute(select(Warehouse.id, Warehouse.branch_id, Warehouse.is_default).where(Warehouse.tenant_id == tenant_id, Warehouse.is_active.is_(True))
                           .order_by(Warehouse.is_default.desc(), Warehouse.created_at)).all()
    if not rows:
        return None, []
    ids = [r[0] for r in rows]
    chosen = None
    if reason and reason.warehouse_id in ids:
        chosen = reason.warehouse_id
    if chosen is None:
        branch = stock_context.current_branch_id.get()
        chosen = next((r[0] for r in rows if branch and r[1] == branch), None) or next((r[0] for r in rows if r[2]), ids[0])
    return chosen, [i for i in ids if i != chosen]


def record_changes(session: Session, flush_context, instances) -> None:
    changes = _pending_changes(session)
    if not changes:
        return
    reason = stock_context.current_reason.get()
    pending: dict[tuple[uuid.UUID, Key], Decimal] = defaultdict(lambda: ZERO)  # taken out earlier in this same flush
    for key, tenant_id, delta in changes:
        chosen, others = _pick_warehouse(session, tenant_id, reason)
        if chosen is None:
            continue  # this business does not use warehouses
        mtype = reason.movement_type if reason else ("receipt" if delta > 0 else "adjustment")
        base = {"reference_type": reason.reference_type if reason else None, "reference_id": reason.reference_id if reason else None,
                "reference_number": reason.reference_number if reason else None, "note": reason.note if reason else None}
        if delta > 0:
            session.add(_movement(tenant_id, chosen, key[0], key[1], delta, mtype, **base))
            continue
        need = -delta
        for warehouse_id in [chosen, *others]:  # take from the chosen place first, then wherever the stock really is
            if need <= 0:
                break
            have = _balance_sync(session, tenant_id, warehouse_id, key) + pending[(warehouse_id, key)]
            take = min(need, max(have, ZERO))
            if take > 0:
                session.add(_movement(tenant_id, warehouse_id, key[0], key[1], -take, mtype, **base))
                pending[(warehouse_id, key)] -= take
                need -= take
        if need > 0:  # the books say more was available than the ledger holds: record it where it was asked for, visibly negative
            session.add(_movement(tenant_id, chosen, key[0], key[1], -need, mtype, **{**base, "note": (base["note"] or "") + " (more than the ledger held)"}))
    stock_context.current_reason.set(None)


_installed = False


def install() -> None:
    global _installed
    if not _installed:
        event.listen(Session, "before_flush", record_changes)
        _installed = True


# ── Moving stock between warehouses (the total does not change) ──────────────

async def move_between(db: AsyncSession, tenant_id: uuid.UUID, items: list[tuple[uuid.UUID, uuid.UUID | None, str, Decimal]], *, source: uuid.UUID | None,
                       destination: uuid.UUID | None, reference_type: str, reference_id: uuid.UUID, reference_number: str, user_id: uuid.UUID | None) -> None:
    """Dispatch (source set) takes stock out of a warehouse; receipt (destination set) puts it into one. The business total is untouched."""
    for product_id, variant_id, name, quantity in items:
        quantity = _dec(quantity)
        if source is not None:
            have = (await balances(db, tenant_id, source)).get((source, product_id, variant_id), ZERO)
            if have < quantity:
                raise ValidationError(f"Not enough '{name}' in the source warehouse (on hand {have:g}, needed {quantity:g})")
            db.add(_movement(tenant_id, source, product_id, variant_id, -quantity, "transfer_out", reference_type=reference_type, reference_id=reference_id,
                             reference_number=reference_number, user_id=user_id))
        if destination is not None:
            db.add(_movement(tenant_id, destination, product_id, variant_id, quantity, "transfer_in", reference_type=reference_type, reference_id=reference_id,
                             reference_number=reference_number, user_id=user_id))
    await db.flush()
