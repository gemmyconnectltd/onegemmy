"""Warehouses, stock by warehouse, the movement history and stock counts."""
import re
import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal

from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import stock_context
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.models.warehouse import (
    StockCount,
    StockCountLine,
    StockMovement,
    Warehouse,
)
from app.modules.inventory.service.stock_ledger import (
    balances,
    ensure_default_warehouse,
    has_warehouses,
)
from app.modules.tenants.models import Branch, User

ZERO = Decimal(0)


def _dec(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def _q(v: Decimal) -> float:
    return float(v)


# ── Warehouses ───────────────────────────────────────────────────────────────

def _row(w: Warehouse, units: Decimal = ZERO, products: int = 0) -> dict:
    return {"id": w.id, "code": w.code, "name": w.name, "branch_id": w.branch_id, "branch_name": w.branch.name if w.branch else None, "manager_id": w.manager_id,
            "manager_name": w.manager.full_name if w.manager else None, "address": w.address, "description": w.description, "is_active": w.is_active,
            "is_default": w.is_default, "units_on_hand": _q(units), "products": products}


async def list_warehouses(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    rows = (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id).order_by(Warehouse.is_default.desc(), Warehouse.name))).unique().scalars().all()
    units: dict[uuid.UUID, Decimal] = {}
    kinds: dict[uuid.UUID, set] = {}
    for (w, p, v), qty in (await balances(db, tenant_id)).items():
        units[w] = units.get(w, ZERO) + qty
        if qty != 0:
            kinds.setdefault(w, set()).add((p, v))
    return {"enabled": bool(rows), "items": [_row(w, units.get(w.id, ZERO), len(kinds.get(w.id, ()))) for w in rows]}


async def _get(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> Warehouse:
    w = (await db.execute(select(Warehouse).where(Warehouse.id == id, Warehouse.tenant_id == tenant_id).execution_options(populate_existing=True))).unique().scalar_one_or_none()
    if w is None:
        raise NotFoundError("Warehouse not found")
    return w


async def _next_code(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    codes = (await db.execute(select(Warehouse.code).where(Warehouse.tenant_id == tenant_id))).scalars().all()
    top = max((int(m.group(1)) for c in codes if (m := re.fullmatch(r"WH-(\d+)", c))), default=0)
    return f"WH-{top + 1:03d}"


async def _check_links(db: AsyncSession, tenant_id: uuid.UUID, branch_id, manager_id) -> None:
    if branch_id and (await db.execute(select(Branch.id).where(Branch.id == branch_id, Branch.tenant_id == tenant_id))).first() is None:
        raise ValidationError("Choose a branch of this business")
    if manager_id and (await db.execute(select(User.id).where(User.id == manager_id, User.tenant_id == tenant_id, User.is_active.is_(True)))).first() is None:
        raise ValidationError("Choose an active member of this business as the manager")


async def setup_warehouses(db: AsyncSession, tenant_id: uuid.UUID, user: User) -> dict:
    existed = await has_warehouses(db, tenant_id)
    await ensure_default_warehouse(db, tenant_id)
    if not existed:
        await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="warehouse.setup", entity_type="warehouse", summary="Warehouses switched on")
    await db.commit()
    return await list_warehouses(db, tenant_id)


async def create_warehouse(db: AsyncSession, tenant_id: uuid.UUID, user: User, data: dict) -> dict:
    await ensure_default_warehouse(db, tenant_id)
    await _check_links(db, tenant_id, data.get("branch_id"), data.get("manager_id"))
    code = (data.get("code") or "").strip().upper() or await _next_code(db, tenant_id)
    if (await db.execute(select(Warehouse.id).where(Warehouse.tenant_id == tenant_id, func.upper(Warehouse.code) == code))).first():
        raise ConflictError(f"The code {code} is already used by another warehouse")
    w = Warehouse(tenant_id=tenant_id, code=code, name=data["name"].strip(), branch_id=data.get("branch_id"), manager_id=data.get("manager_id"),
                  address=data.get("address"), description=data.get("description"), is_active=True, is_default=False)
    db.add(w)
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="warehouse.create", entity_type="warehouse", entity_id=str(w.id), summary=f"Warehouse {code} created")
    await db.commit()
    return _row(await _get(db, tenant_id, w.id))


async def update_warehouse(db: AsyncSession, tenant_id: uuid.UUID, user: User, id: uuid.UUID, data: dict) -> dict:
    w = await _get(db, tenant_id, id)
    await _check_links(db, tenant_id, data.get("branch_id"), data.get("manager_id"))
    if "code" in data and data["code"] and data["code"].strip().upper() != w.code:
        code = data["code"].strip().upper()
        if (await db.execute(select(Warehouse.id).where(Warehouse.tenant_id == tenant_id, func.upper(Warehouse.code) == code, Warehouse.id != id))).first():
            raise ConflictError(f"The code {code} is already used by another warehouse")
        w.code = code
    for field in ("name", "branch_id", "manager_id", "address", "description"):
        if field in data:
            setattr(w, field, data[field].strip() if field == "name" and data[field] else data[field])
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="warehouse.update", entity_type="warehouse", entity_id=str(w.id), summary=f"Warehouse {w.code} edited")
    await db.commit()
    return _row(await _get(db, tenant_id, id))


async def set_active(db: AsyncSession, tenant_id: uuid.UUID, user: User, id: uuid.UUID, active: bool) -> dict:
    """A warehouse that still holds stock, or has transfers or counts in progress, cannot be switched off: resolve those first."""
    w = await _get(db, tenant_id, id)
    if not active:
        if w.is_default:
            raise ConflictError("The default warehouse cannot be deactivated. Make another warehouse the default first.")
        held = sum((q for (wh, _, _), q in (await balances(db, tenant_id, id)).items()), ZERO)
        if held != 0:
            raise ConflictError(f"{w.name} still holds {held:g} units. Transfer them to another warehouse first.")
        if (await db.execute(select(StockTransfer.id).where(StockTransfer.tenant_id == tenant_id, StockTransfer.status.in_(["pending", "in_transit"]),
                                                            or_(StockTransfer.from_warehouse_id == id, StockTransfer.to_warehouse_id == id)).limit(1))).first():
            raise ConflictError(f"{w.name} has transfers that are not finished. Complete or cancel them first.")
        if (await db.execute(select(StockCount.id).where(StockCount.tenant_id == tenant_id, StockCount.warehouse_id == id, StockCount.status == "Submitted").limit(1))).first():
            raise ConflictError(f"{w.name} has a stock count waiting for a decision. Approve or reject it first.")
    w.is_active = active
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="warehouse.activate" if active else "warehouse.deactivate",
                       entity_type="warehouse", entity_id=str(w.id), summary=f"Warehouse {w.code} {'activated' if active else 'deactivated'}")
    await db.commit()
    return _row(await _get(db, tenant_id, id))


async def make_default(db: AsyncSession, tenant_id: uuid.UUID, user: User, id: uuid.UUID) -> dict:
    w = await _get(db, tenant_id, id)
    if not w.is_active:
        raise ConflictError("Activate the warehouse before making it the default")
    for other in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id, Warehouse.is_default.is_(True)))).unique().scalars():
        other.is_default = False
    w.is_default = True
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="warehouse.default", entity_type="warehouse", entity_id=str(w.id), summary=f"{w.code} is now the default warehouse")
    await db.commit()
    return _row(await _get(db, tenant_id, id))


# ── Stock by warehouse ───────────────────────────────────────────────────────

async def stock_rows(db: AsyncSession, tenant_id: uuid.UUID, *, warehouse_id: uuid.UUID | None, branch_id: uuid.UUID | None, search: str | None,
                     status: str | None, offset: int, limit: int) -> tuple[list[dict], int]:
    """One row per product (and variant) per warehouse: on hand, available, unit, last movement and a stock status. Nothing is reserved separately, so available equals on hand."""
    bal = {k: v for k, v in (await balances(db, tenant_id, warehouse_id)).items() if v != 0}
    if branch_id:
        in_branch = set((await db.execute(select(Warehouse.id).where(Warehouse.tenant_id == tenant_id, Warehouse.branch_id == branch_id))).scalars())
        bal = {k: v for k, v in bal.items() if k[0] in in_branch}
    if not bal:
        return [], 0
    pids = {k[1] for k in bal}
    products = {p.id: p for p in (await db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(pids)))).unique().scalars()}
    variants = {v.id: v for v in (await db.execute(select(ProductVariant).where(ProductVariant.product_id.in_(pids)))).scalars()}
    last = {(w, p, v): at for w, p, v, at in (await db.execute(
        select(StockMovement.warehouse_id, StockMovement.product_id, StockMovement.variant_id, func.max(StockMovement.created_at))
        .where(StockMovement.tenant_id == tenant_id, StockMovement.product_id.in_(pids)).group_by(StockMovement.warehouse_id, StockMovement.product_id, StockMovement.variant_id))).all()}
    wh = {w.id: w for w in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).unique().scalars()}
    out = []
    needle = (search or "").strip().lower()
    for (w, p, v), qty in bal.items():
        product = products.get(p)
        if product is None or w not in wh:
            continue
        variant = variants.get(v) if v else None
        name = product.name + (f" · {' / '.join(variant.attributes.values())}" if variant and variant.attributes else "")
        sku = (variant.sku if variant and variant.sku else product.sku) or ""
        if needle and needle not in name.lower() and needle not in sku.lower() and needle not in (product.barcode or "").lower():
            continue
        minimum = _dec(variant.min_stock if variant else product.min_stock)
        state = "out" if qty <= 0 else "low" if qty <= minimum else "ok"
        if status and status != state:
            continue
        out.append({"warehouse_id": w, "warehouse": wh[w].name, "warehouse_code": wh[w].code, "branch_id": wh[w].branch_id, "product_id": p, "variant_id": v, "name": name, "sku": sku or None,
                    "unit": (product.unit.abbreviation or product.unit.name) if product.unit else None, "on_hand": _q(qty), "reserved": 0.0, "available": _q(qty),
                    "minimum": _q(minimum), "status": state, "last_movement": last.get((w, p, v))})
    out.sort(key=lambda r: (r["name"].lower(), r["warehouse"]))
    return out[offset:offset + limit], len(out)


async def movements(db: AsyncSession, tenant_id: uuid.UUID, *, warehouse_id: uuid.UUID | None, product_id: uuid.UUID | None, movement_type: str | None,
                    start: date | None, end: date | None, offset: int, limit: int) -> tuple[list[dict], int]:
    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant_id)
    if warehouse_id:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    if product_id:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if movement_type:
        stmt = stmt.where(StockMovement.movement_type == movement_type)
    if start:
        stmt = stmt.where(StockMovement.created_at >= datetime.combine(start, time.min, UTC))
    if end:
        stmt = stmt.where(StockMovement.created_at < datetime.combine(end, time.max, UTC))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(StockMovement.created_at.desc(), StockMovement.id).offset(offset).limit(limit))).unique().scalars().all()
    names = {p.id: p.name for p in (await db.execute(select(Product.id, Product.name).where(Product.id.in_({r.product_id for r in rows} or [None])))).all()}
    users = {u.id: u.full_name for u in (await db.execute(select(User.id, User.full_name).where(User.id.in_({r.user_id for r in rows if r.user_id} or [None])))).all()}
    from app.modules.procurement.models.purchase_order import PurchaseOrder
    from app.modules.sales.models.order import Order
    order_ids = {r.reference_id for r in rows if r.reference_type == "order" and r.reference_id}
    po_ids = {r.reference_id for r in rows if r.reference_type == "purchase" and r.reference_id}
    numbers: dict[uuid.UUID, str] = {}
    if order_ids:
        numbers.update({i: n for i, n in (await db.execute(select(Order.id, Order.order_number).where(Order.id.in_(order_ids)))).all()})
    if po_ids:
        numbers.update({i: n for i, n in (await db.execute(select(PurchaseOrder.id, PurchaseOrder.reference).where(PurchaseOrder.id.in_(po_ids)))).all()})
    return [{"id": r.id, "created_at": r.created_at, "warehouse_id": r.warehouse_id, "warehouse": r.warehouse.name if r.warehouse else None, "product_id": r.product_id,
             "variant_id": r.variant_id, "product": names.get(r.product_id), "quantity": _q(_dec(r.quantity)), "direction": "in" if r.quantity > 0 else "out", "movement_type": r.movement_type,
             "reference_type": r.reference_type, "reference_number": r.reference_number or numbers.get(r.reference_id), "note": r.note, "user": users.get(r.user_id), "status": "Posted"} for r in rows], total


async def receive_stock(db: AsyncSession, tenant_id: uuid.UUID, user: User, warehouse_id: uuid.UUID, lines: list[dict], note: str | None, reference: str | None) -> dict:
    """Books goods that arrived at a warehouse without a purchase order (a gift, a found item, a delivery being recorded late). Goods bought on a purchase order are received there."""
    w = await _get(db, tenant_id, warehouse_id)
    if not w.is_active:
        raise ConflictError("This warehouse is not active")
    if not lines:
        raise ValidationError("Add at least one product to receive")
    for line in lines:
        qty = _dec(line["quantity"])
        if qty <= 0:
            raise ValidationError("Every quantity must be above zero")
        stock_context.set_reason("receipt", reference_type="receipt", reference_number=reference, note=note, warehouse_id=warehouse_id)
        if line.get("variant_id"):
            variant = (await db.execute(select(ProductVariant).join(Product, Product.id == ProductVariant.product_id)
                                         .where(ProductVariant.id == line["variant_id"], Product.tenant_id == tenant_id))).scalar_one_or_none()
            if variant is None:
                raise ValidationError("A variant was not found in this business")
            variant.stock = _dec(variant.stock) + qty
        else:
            product = (await db.execute(select(Product).where(Product.id == line["product_id"], Product.tenant_id == tenant_id))).unique().scalar_one_or_none()
            if product is None:
                raise ValidationError("A product was not found in this business")
            product.stock = _dec(product.stock) + qty
        await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="warehouse.receive", entity_type="warehouse", entity_id=str(w.id),
                       summary=f"Stock received into {w.code}", changes={"lines": len(lines), "reference": reference})
    await db.commit()
    return {"received": len(lines), "warehouse": w.name}


# ── Stock counts ─────────────────────────────────────────────────────────────

async def _count_number(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    top = (await db.execute(select(func.max(cast(func.substring(StockCount.count_number, 5), Integer))).where(StockCount.tenant_id == tenant_id))).scalar_one() or 0
    return f"CNT-{top + 1:04d}"


def _count_read(c: StockCount) -> dict:
    lines = [{"id": line.id, "product_id": line.product_id, "variant_id": line.variant_id, "product_name": line.product_name, "expected": _q(_dec(line.expected_quantity)),
              "counted": _q(_dec(line.counted_quantity)), "difference": _q(_dec(line.counted_quantity) - _dec(line.expected_quantity))} for line in c.lines]
    return {"id": c.id, "count_number": c.count_number, "warehouse_id": c.warehouse_id, "warehouse": c.warehouse.name if c.warehouse else None, "status": c.status, "note": c.note,
            "counted_by": c.counted_by, "decided_by": c.decided_by, "decided_at": c.decided_at, "decision_note": c.decision_note, "created_at": c.created_at, "lines": lines,
            "variance_lines": sum(1 for x in lines if x["difference"] != 0)}


async def _count(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, lock: bool = False) -> StockCount:
    stmt = select(StockCount).where(StockCount.id == id, StockCount.tenant_id == tenant_id).execution_options(populate_existing=True)
    if lock:
        stmt = stmt.with_for_update(of=StockCount)
    c = (await db.execute(stmt)).unique().scalar_one_or_none()
    if c is None:
        raise NotFoundError("Stock count not found")
    return c


async def submit_count(db: AsyncSession, tenant_id: uuid.UUID, user: User, warehouse_id: uuid.UUID, lines: list[dict], note: str | None, may_apply: bool) -> dict:
    """Records what was physically counted against what the books say. The difference becomes an adjustment only when someone with authority approves it
    (or straight away when the business has switched stock-adjustment approval off and the counter may adjust stock)."""
    w = await _get(db, tenant_id, warehouse_id)
    if not w.is_active:
        raise ConflictError("This warehouse is not active")
    if not lines:
        raise ValidationError("Count at least one product")
    book = await balances(db, tenant_id, warehouse_id)
    count = StockCount(tenant_id=tenant_id, count_number=await _count_number(db, tenant_id), warehouse_id=warehouse_id, status="Submitted", note=note, counted_by=user.id)
    seen: set = set()
    for line in lines:
        key = (line["product_id"], line.get("variant_id"))
        if key in seen:
            raise ValidationError("A product appears twice in the count")
        seen.add(key)
        if _dec(line["counted_quantity"]) < 0:
            raise ValidationError("A counted quantity cannot be negative")
        product = (await db.execute(select(Product).where(Product.id == key[0], Product.tenant_id == tenant_id))).unique().scalar_one_or_none()
        if product is None:
            raise ValidationError("A product was not found in this business")
        name = product.name
        if key[1]:
            variant = await db.get(ProductVariant, key[1])
            if variant is None or variant.product_id != product.id:
                raise ValidationError("A variant does not belong to its product")
            name += f" · {' / '.join(variant.attributes.values())}" if variant.attributes else ""
        count.lines.append(StockCountLine(product_id=key[0], variant_id=key[1], product_name=name, expected_quantity=book.get((warehouse_id, key[0], key[1]), ZERO),
                                          counted_quantity=_dec(line["counted_quantity"])))
    db.add(count)
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="stock_count.submit", entity_type="stock_count", entity_id=str(count.id),
                       summary=f"Stock count {count.count_number} submitted for {w.code}")
    from app.modules.approvals.service import rule_on
    if may_apply and not await rule_on(db, tenant_id, "stock_adjustment"):
        await _apply(db, tenant_id, user, count, "Applied on submission: stock adjustments do not need approval here")
    await db.commit()
    return _count_read(await _count(db, tenant_id, count.id))


async def _apply(db: AsyncSession, tenant_id: uuid.UUID, user: User, count: StockCount, note: str | None) -> None:
    for line in count.lines:
        diff = _dec(line.counted_quantity) - _dec(line.expected_quantity)
        if diff == 0:
            continue
        stock_context.set_reason("count", reference_type="stock_count", reference_id=count.id, reference_number=count.count_number, note="Stock count difference", warehouse_id=count.warehouse_id)
        if line.variant_id:
            variant = await db.get(ProductVariant, line.variant_id)
            variant.stock = max(ZERO, _dec(variant.stock) + diff)
        else:
            product = await db.get(Product, line.product_id)
            product.stock = max(ZERO, _dec(product.stock) + diff)
        await db.flush()
    count.status, count.decided_by, count.decided_at, count.decision_note = "Approved", user.id, datetime.now(UTC), note
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="stock_count.approve", entity_type="stock_count", entity_id=str(count.id),
                       summary=f"Stock count {count.count_number} approved and applied", changes={"note": note})


async def decide_count(db: AsyncSession, tenant_id: uuid.UUID, user: User, id: uuid.UUID, approve: bool, note: str | None) -> dict:
    count = await _count(db, tenant_id, id, lock=True)
    if count.status != "Submitted":
        raise ConflictError(f"This count was already {count.status.lower()}")
    if count.counted_by == user.id and not user.is_superuser:
        raise ForbiddenError("Someone else must approve a count you made")
    if approve:
        await _apply(db, tenant_id, user, count, (note or "").strip() or None)
    else:
        if len((note or "").strip()) < 3:
            raise ValidationError("Give a reason for rejecting the count")
        count.status, count.decided_by, count.decided_at, count.decision_note = "Rejected", user.id, datetime.now(UTC), note.strip()
        await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="stock_count.reject", entity_type="stock_count", entity_id=str(count.id),
                           summary=f"Stock count {count.count_number} rejected", changes={"note": note})
    await db.commit()
    return _count_read(await _count(db, tenant_id, id))


async def list_counts(db: AsyncSession, tenant_id: uuid.UUID, *, status: str | None, offset: int, limit: int) -> tuple[list[dict], int]:
    stmt = select(StockCount).where(StockCount.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(StockCount.status == status)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(StockCount.created_at.desc()).offset(offset).limit(limit))).unique().scalars().all()
    return [_count_read(c) for c in rows], total


async def get_count(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> dict:
    return _count_read(await _count(db, tenant_id, id))
