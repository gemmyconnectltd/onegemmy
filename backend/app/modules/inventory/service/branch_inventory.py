"""Stock by branch: one catalogue for the business, every branch keeps its own stock in its own warehouse.

* Each warehouse belongs to exactly one row: its branch, or "Shared" when no branch owns it. So the branch rows always add up to
  the business total (scenario: "All branches" = the sum of the branches).
* A branch judges "low" against its own reorder level (BranchReorderLevel), else the product's (or variant's) min_stock.
* A product counts in a branch once the branch has stocked it (any movement in its warehouses) or has its own reorder level;
  a branch that has never carried a product is not "out" of it. Products hidden in a branch (branch pricing) are left out there.
* A business without warehouses has one stock figure: everything here answers with `uses_warehouses: false` and no branch rows.
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.inventory.models.branch_reorder import BranchReorderLevel
from app.modules.inventory.models.branch_setting import ProductBranchSetting
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer, StockTransferItem
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.models.warehouse import StockMovement, Warehouse
from app.modules.inventory.service.branch_stock import restricted_branches
from app.modules.tenants.models import Branch

ZERO = Decimal(0)
SHARED = "shared"
Key = tuple[uuid.UUID, uuid.UUID | None]  # (product, variant)
SORTS = {"name", "value", "units", "low", "out", "incoming"}


def _d(v: Any) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def _f(v: Decimal) -> float:
    return float(round(v, 3))


def status(qty: Decimal, level: Decimal) -> str:
    return "out" if qty <= 0 else "low" if qty <= level else "ok"


@dataclass
class Layout:
    """Where each branch's stock is kept."""
    branches: list[Branch]
    owner: dict[uuid.UUID, uuid.UUID | None]  # warehouse -> branch (None: shared)
    names: dict[uuid.UUID, str]
    by_branch: dict[Any, set[uuid.UUID]] = field(default_factory=dict)  # branch id or SHARED -> its warehouses

    def row_of(self, warehouse_id: uuid.UUID) -> Any:
        owner = self.owner.get(warehouse_id)
        return owner if owner is not None and owner in self.by_branch else SHARED


async def layout(db: AsyncSession, tenant_id: uuid.UUID, branch_ids: list[uuid.UUID] | None = None) -> Layout | None:
    """None when the business does not use warehouses."""
    rows = (await db.execute(select(Warehouse.id, Warehouse.branch_id, Warehouse.name).where(Warehouse.tenant_id == tenant_id))).all()
    if not rows:
        return None
    stmt = select(Branch).where(Branch.tenant_id == tenant_id, Branch.status == "active").order_by(Branch.is_main.desc(), Branch.name)
    if branch_ids is not None:
        stmt = stmt.where(Branch.id.in_(branch_ids))
    branches = list((await db.execute(stmt)).scalars().all())
    out = Layout(branches=branches, owner={r.id: r.branch_id for r in rows}, names={r.id: r.name for r in rows})
    for b in branches:
        out.by_branch[b.id] = {r.id for r in rows if r.branch_id == b.id}
    if branch_ids is None:
        shared = {r.id for r in rows if r.branch_id is None or r.branch_id not in out.by_branch}
        if shared:
            out.by_branch[SHARED] = shared
    return out


async def _on_hand(db: AsyncSession, tenant_id: uuid.UUID, product_ids: list[uuid.UUID] | None = None) -> dict[tuple[uuid.UUID, uuid.UUID, uuid.UUID | None], Decimal]:
    stmt = (select(StockMovement.warehouse_id, StockMovement.product_id, StockMovement.variant_id, func.sum(StockMovement.quantity))
            .where(StockMovement.tenant_id == tenant_id))
    if product_ids is not None:
        stmt = stmt.where(StockMovement.product_id.in_(product_ids))
    rows = (await db.execute(stmt.group_by(StockMovement.warehouse_id, StockMovement.product_id, StockMovement.variant_id))).all()
    return {(w, p, v): _d(q) for w, p, v, q in rows}


async def levels(db: AsyncSession, tenant_id: uuid.UUID, branch_ids: list[uuid.UUID] | None = None,
                 product_ids: list[uuid.UUID] | None = None) -> dict[tuple[uuid.UUID, uuid.UUID, uuid.UUID | None], Decimal]:
    """{(branch, product, variant): that branch's own reorder level}."""
    stmt = select(BranchReorderLevel.branch_id, BranchReorderLevel.product_id, BranchReorderLevel.variant_id, BranchReorderLevel.reorder_level).where(
        BranchReorderLevel.tenant_id == tenant_id)
    if branch_ids is not None:
        stmt = stmt.where(BranchReorderLevel.branch_id.in_(branch_ids))
    if product_ids is not None:
        stmt = stmt.where(BranchReorderLevel.product_id.in_(product_ids))
    return {(b, p, v): _d(level) for b, p, v, level in (await db.execute(stmt)).all()}


async def branch_levels(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> dict[Key, Decimal]:
    """{(product, variant): reorder level} for one branch, only where the branch has its own. Used to judge low stock in that branch."""
    return {(p, v): level for (_, p, v), level in (await levels(db, tenant_id, [branch_id])).items()}


async def _hidden(db: AsyncSession, tenant_id: uuid.UUID) -> set[tuple[uuid.UUID, uuid.UUID]]:
    from app.modules.inventory.service.branch_pricing import is_enabled
    if not await is_enabled(db, tenant_id):
        return set()
    rows = (await db.execute(select(ProductBranchSetting.branch_id, ProductBranchSetting.product_id).where(
        ProductBranchSetting.tenant_id == tenant_id, ProductBranchSetting.is_available.is_(False)))).all()
    return {(b, p) for b, p in rows}


async def _incoming(db: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, dict[str, Any]]:
    """{destination warehouse: {"transfers": [numbers], "units": n}} for transfers sent and not yet received."""
    rows = (await db.execute(select(StockTransfer.to_warehouse_id, StockTransfer.transfer_number, func.sum(StockTransferItem.quantity))
                             .join(StockTransferItem, StockTransferItem.transfer_id == StockTransfer.id)
                             .where(StockTransfer.tenant_id == tenant_id, StockTransfer.status == "in_transit", StockTransfer.to_warehouse_id.isnot(None))
                             .group_by(StockTransfer.to_warehouse_id, StockTransfer.transfer_number))).all()
    out: dict[uuid.UUID, dict[str, Any]] = defaultdict(lambda: {"transfers": [], "units": ZERO})
    for w, number, qty in rows:
        out[w]["transfers"].append(number)
        out[w]["units"] += _d(qty)
    return out


def _items(products: list[Product]) -> list[tuple[Product, ProductVariant | None]]:
    out = []
    for p in products:
        if p.has_variants:
            out.extend((p, v) for v in p.variants if v.is_active)
        else:
            out.append((p, None))
    return out


def _allowed_rows(user: Any, lay: Layout) -> list[Any]:
    mine = restricted_branches(user)
    rows = [b.id for b in lay.branches] + ([SHARED] if SHARED in lay.by_branch else [])
    return rows if mine is None else [r for r in rows if r in set(mine)]


async def summary(db: AsyncSession, user: Any, *, sort: str = "name", descending: bool = False, offset: int = 0, limit: int = 8) -> dict:
    """Per branch: stock value at cost and retail, units, products held, low, out and stock on the way in; plus the business total.
    People limited to some branches get only those rows (and a total of those rows)."""
    if sort not in SORTS:
        raise ValidationError(f"Sort by one of: {', '.join(sorted(SORTS))}")
    tenant_id = user.tenant_id
    lay = await layout(db, tenant_id)
    if lay is None:
        return {"uses_warehouses": False, "items": [], "total": 0, "totals": None}
    rows_allowed = _allowed_rows(user, lay)
    products = list((await db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.is_active.is_(True)))).unique().scalars().all())
    items = _items(products)
    on_hand = await _on_hand(db, tenant_id)
    own_levels = await levels(db, tenant_id)
    hidden = await _hidden(db, tenant_id)
    incoming = await _incoming(db, tenant_id)
    names = {b.id: b.name for b in lay.branches}

    per_row: dict[Any, dict[Key, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    carried: dict[Any, set[Key]] = defaultdict(set)
    for (w, p, v), q in on_hand.items():
        row = lay.row_of(w)
        per_row[row][(p, v)] += q
        carried[row].add((p, v))
    for (b, p, v) in own_levels:
        carried[b].add((p, v))

    out = []
    for row in rows_allowed:
        cost = retail = units = ZERO
        held = low = out_ = 0
        stock = per_row.get(row, {})
        for p, v in items:
            key = (p.id, v.id if v else None)
            if row != SHARED and (row, p.id) in hidden:
                continue
            qty = stock.get(key, ZERO)
            unit_cost, unit_price = _d((v or p).cost), _d((v or p).price)
            cost += unit_cost * qty
            retail += unit_price * qty
            units += qty
            if qty > 0:
                held += 1
            if key in carried.get(row, set()):
                level = own_levels.get((row, *key), _d((v or p).min_stock))
                state = status(qty, level)
                low += state == "low"
                out_ += state == "out"
        coming = [incoming[w] for w in lay.by_branch.get(row, set()) if w in incoming]
        out.append({
            "branch_id": None if row == SHARED else row, "name": "Shared warehouses" if row == SHARED else names[row], "shared": row == SHARED,
            "warehouses": sorted(lay.names[w] for w in lay.by_branch.get(row, set())),
            "value_cost": _f(cost), "value_retail": _f(retail), "units": _f(units), "products": held, "low": low, "out": out_,
            "incoming_transfers": sorted(n for c in coming for n in c["transfers"]), "incoming_units": _f(sum((c["units"] for c in coming), ZERO)),
        })
    totals = {k: _f(sum((_d(r[k]) for r in out), ZERO)) for k in ("value_cost", "value_retail", "units", "incoming_units")}
    totals.update({k: sum(r[k] for r in out) for k in ("low", "out")})
    totals["products"] = len({key for row in rows_allowed for key, q in per_row.get(row, {}).items() if q > 0})
    totals["catalogue"] = len(items)
    key = {"name": lambda r: r["name"].lower(), "value": lambda r: r["value_cost"], "units": lambda r: r["units"], "low": lambda r: r["low"],
           "out": lambda r: r["out"], "incoming": lambda r: r["incoming_units"]}[sort]
    out.sort(key=key, reverse=descending)
    return {"uses_warehouses": True, "items": out[offset:offset + limit], "total": len(out), "totals": totals, "branch_count": len(lay.branches)}


async def attach_per_branch(db: AsyncSession, user: Any, items: list[Any]) -> dict | None:
    """Give each listed product (ProductRead) its quantity in every branch the person may see, its total, how many branches hold
    it and where it is out. One query per page. Returns the branch columns, or None without warehouses."""
    tenant_id = user.tenant_id
    lay = await layout(db, tenant_id)
    if lay is None or not items:
        return None if lay is None else {"branches": [], "shared": False}
    rows_allowed = _allowed_rows(user, lay)
    ids = [i.id for i in items]
    on_hand = await _on_hand(db, tenant_id, ids)
    own_levels = await levels(db, tenant_id, product_ids=ids)
    hidden = await _hidden(db, tenant_id)
    names = {b.id: b.name for b in lay.branches}
    by_product: dict[uuid.UUID, dict[Any, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    by_variant: dict[tuple[uuid.UUID, uuid.UUID | None], dict[Any, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    carried: dict[uuid.UUID, set[Any]] = defaultdict(set)
    for (w, p, v), q in on_hand.items():
        row = lay.row_of(w)
        by_product[p][row] += q
        by_variant[(p, v)][row] += q
        carried[p].add(row)
    for (b, p, _v) in own_levels:
        carried[p].add(b)
    for item in items:
        cells, out_in = [], []
        variants = [v for v in (getattr(item, "variants", None) or []) if getattr(v, "is_active", True)] if getattr(item, "has_variants", False) else []
        for row in rows_allowed:
            level = own_levels.get((row, item.id, None), _d(item.min_stock)) if row != SHARED else _d(item.min_stock)
            if row != SHARED and (row, item.id) in hidden:
                cells.append({"branch_id": row, "quantity": None, "status": "not_sold", "reorder_level": _f(level)})
                continue
            qty = by_product.get(item.id, {}).get(row, ZERO)
            if row not in carried.get(item.id, set()):
                state = "none" if qty == 0 else status(qty, ZERO)
            elif variants:
                states = [status(by_variant.get((item.id, v.id), {}).get(row, ZERO), own_levels.get((row, item.id, v.id), _d(v.min_stock))) for v in variants]
                state = "out" if all(s == "out" for s in states) else "low" if any(s != "ok" for s in states) else "ok"
            else:
                state = status(qty, level)
            if state == "out" and row != SHARED:
                out_in.append(names[row])
            cells.append({"branch_id": None if row == SHARED else row, "quantity": _f(qty), "status": state, "reorder_level": _f(level)})
        item.branch_stock = cells
        item.held_in = sum(1 for c in cells if c["quantity"] and c["quantity"] > 0)
        item.out_in = out_in
        item.low_in_any = any(c["status"] in ("low", "out") for c in cells)
    return {"branches": [{"id": None if r == SHARED else r, "name": "Shared" if r == SHARED else names[r]} for r in rows_allowed],
            "branch_count": len([r for r in rows_allowed if r != SHARED])}


async def product_branches(db: AsyncSession, user: Any, product_id: uuid.UUID) -> dict:
    """One product in every branch the person may see: warehouse, on hand, reorder level (own or the product's), status, value,
    last movement, stock on the way in and whether the branch sells it."""
    tenant_id = user.tenant_id
    product = (await db.execute(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id))).unique().scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product not found")
    lay = await layout(db, tenant_id)
    if lay is None:
        return {"uses_warehouses": False, "product_id": product_id, "items": [], "total_on_hand": float(product.stock or 0)}
    rows_allowed = [r for r in _allowed_rows(user, lay) if r != SHARED or any(lay.by_branch[SHARED])]
    on_hand = await _on_hand(db, tenant_id, [product_id])
    own = await levels(db, tenant_id, product_ids=[product_id])
    hidden = await _hidden(db, tenant_id)
    incoming = (await db.execute(select(StockTransfer.to_warehouse_id, func.sum(StockTransferItem.quantity))
                                 .join(StockTransferItem, StockTransferItem.transfer_id == StockTransfer.id)
                                 .where(StockTransfer.tenant_id == tenant_id, StockTransfer.status == "in_transit", StockTransferItem.product_id == product_id)
                                 .group_by(StockTransfer.to_warehouse_id))).all()
    coming = {w: _d(q) for w, q in incoming}
    last: dict[uuid.UUID, datetime] = dict((await db.execute(
        select(StockMovement.warehouse_id, func.max(StockMovement.created_at)).where(StockMovement.tenant_id == tenant_id, StockMovement.product_id == product_id)
        .group_by(StockMovement.warehouse_id))).all())
    names = {b.id: b.name for b in lay.branches}
    mine = restricted_branches(user)
    variants = [v for v in product.variants if v.is_active] if product.has_variants else []
    out = []
    for row in rows_allowed:
        warehouses = lay.by_branch.get(row, set())
        qty = sum((q for (w, _p, _v), q in on_hand.items() if w in warehouses), ZERO)
        level = own.get((row, product_id, None)) if row != SHARED else None
        default_level = _d(product.min_stock)
        cost, price = _d(product.cost), _d(product.price)
        value = sum(((_d(v.cost) if v else cost) * q for (w, _p, vid), q in on_hand.items() if w in warehouses
                     for v in [next((x for x in variants if x.id == vid), None)]), ZERO)
        moved = [last[w] for w in warehouses if w in last]
        out.append({
            "branch_id": None if row == SHARED else row, "name": "Shared warehouses" if row == SHARED else names[row], "shared": row == SHARED,
            "warehouses": [{"id": w, "name": lay.names[w]} for w in sorted(warehouses, key=lambda w: lay.names[w])],
            "on_hand": _f(qty), "reorder_level": _f(level if level is not None else default_level), "own_reorder_level": level is not None,
            "status": status(qty, level if level is not None else default_level), "value_cost": _f(value), "value_retail": _f(price * qty) if not variants else None,
            "in_transit": _f(sum((coming.get(w, ZERO) for w in warehouses), ZERO)), "last_movement": max(moved) if moved else None,
            "is_sold": row == SHARED or (row, product_id) not in hidden,
            "editable": row != SHARED and (mine is None or row in set(mine)),
        })
    return {"uses_warehouses": True, "product_id": product_id, "name": product.name, "default_reorder_level": float(product.min_stock or 0),
            "items": out, "total_on_hand": _f(sum((_d(r["on_hand"]) for r in out), ZERO))}


def may_edit_branch(user: Any, branch_id: uuid.UUID) -> bool:
    """items:update anywhere the person works; limited people only in their own branches."""
    if getattr(user, "is_superuser", False) or (getattr(user, "role", "") or "").lower() in ("admin", "owner"):
        return True
    perms = set(getattr(user, "permissions_names", []) or [])
    mine = restricted_branches(user)
    if mine is not None and branch_id not in set(mine):
        return False
    return "items:update" in perms or (mine is not None and "stock:update" in perms and "branches:update" in perms)


async def set_product_branch(db: AsyncSession, user: Any, product_id: uuid.UUID, branch_id: uuid.UUID, *, reorder_level: float | None,
                             clear_reorder_level: bool, is_sold: bool | None) -> dict:
    """Set (or clear, back to the product's own) a branch's reorder level, and whether the branch sells the product."""
    tenant_id = user.tenant_id
    if not may_edit_branch(user, branch_id):
        raise ForbiddenError("You can change this only for your own branch")
    product = (await db.execute(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id))).unique().scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product not found")
    branch = (await db.execute(select(Branch).where(Branch.id == branch_id, Branch.tenant_id == tenant_id))).scalar_one_or_none()
    if branch is None:
        raise NotFoundError("Branch not found")
    from app.modules.audit.service import record_audit
    changes: dict[str, Any] = {}
    if clear_reorder_level or reorder_level is not None:
        if reorder_level is not None and reorder_level < 0:
            raise ValidationError("A reorder level can't be negative")
        row = (await db.execute(select(BranchReorderLevel).where(
            BranchReorderLevel.tenant_id == tenant_id, BranchReorderLevel.product_id == product_id, BranchReorderLevel.variant_id.is_(None),
            BranchReorderLevel.branch_id == branch_id))).scalar_one_or_none()
        before = float(row.reorder_level) if row else None
        if clear_reorder_level:
            if row is not None:
                await db.execute(delete(BranchReorderLevel).where(BranchReorderLevel.id == row.id))
        elif row is None:
            db.add(BranchReorderLevel(tenant_id=tenant_id, product_id=product_id, branch_id=branch_id, reorder_level=_d(reorder_level), updated_by=user.id))
        else:
            row.reorder_level, row.updated_by = _d(reorder_level), user.id
        changes["reorder_level"] = {"before": before, "after": None if clear_reorder_level else reorder_level}
    if is_sold is not None:
        from app.modules.inventory.schemas.branch_pricing import BranchPriceChange
        from app.modules.inventory.service import branch_pricing
        await branch_pricing.require_enabled(db, tenant_id)
        await branch_pricing.bulk_set(db, user, [BranchPriceChange(product_id=product_id, branch_id=branch_id, is_available=is_sold, keep_price=True)])
        changes["is_sold"] = is_sold
    if changes:
        await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=getattr(user, "full_name", None), action="product.branch_stock",
                           entity_type="product", entity_id=str(product_id), summary=f"{product.name} in {branch.name}: stock settings changed", changes=changes)
    await db.commit()
    return await product_branches(db, user, product_id)


async def needs_stock(db: AsyncSession, user: Any, branch_id: uuid.UUID | None, *, limit: int = 50) -> dict:
    """Products that are low or out in a branch (`branch_id`, or every branch the person may see), most urgent first, each with
    the other branches holding it, so the page can offer "Request from <branch that has it>". Only branches that carry the
    product count (see the module note). Sources are any branch with stock, even ones the person can't open: asking for stock
    names the branch, it never shows that branch's figures beyond the quantity on offer."""
    tenant_id = user.tenant_id
    lay = await layout(db, tenant_id)
    if lay is None:
        return {"uses_warehouses": False, "items": [], "total": 0}
    mine = restricted_branches(user)
    if branch_id is not None:
        rows_wanted = [branch_id]
    else:
        rows_wanted = [b.id for b in lay.branches if mine is None or b.id in set(mine)]
    products = list((await db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.is_active.is_(True)))).unique().scalars().all())
    on_hand = await _on_hand(db, tenant_id)
    own_levels = await levels(db, tenant_id)
    hidden = await _hidden(db, tenant_id)
    names = {b.id: b.name for b in lay.branches}
    per_row: dict[Any, dict[Key, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    carried: dict[Any, set[Key]] = defaultdict(set)
    for (w, p, v), q in on_hand.items():
        row = lay.row_of(w)
        per_row[row][(p, v)] += q
        carried[row].add((p, v))
    for (b, p, v) in own_levels:
        carried[b].add((p, v))
    out = []
    for p, v in _items(products):
        key = (p.id, v.id if v else None)
        label = p.name + (f" · {' / '.join(str(x) for x in (v.attributes or {}).values())}" if v is not None and v.attributes else "")
        for row in rows_wanted:
            if key not in carried.get(row, set()) or (row, p.id) in hidden:
                continue
            qty = per_row.get(row, {}).get(key, ZERO)
            level = own_levels.get((row, *key), _d((v or p).min_stock))
            state = status(qty, level)
            if state == "ok":
                continue
            sources = sorted(({"branch_id": other, "name": names[other], "quantity": _f(per_row[other][key])}
                              for other in names if other != row and per_row.get(other, {}).get(key, ZERO) > 0),
                             key=lambda s: -s["quantity"])
            out.append({"product_id": p.id, "variant_id": key[1], "name": label, "sku": (v.sku if v is not None and v.sku else p.sku),
                        "branch_id": row, "branch": names[row], "on_hand": _f(qty), "reorder_level": _f(level), "status": state,
                        "suggested": _f(max(level * 2 - qty, level - qty, Decimal(1))), "sources": sources[:3]})
    out.sort(key=lambda r: (r["status"] != "out", r["name"].lower(), r["branch"]))
    return {"uses_warehouses": True, "items": out[:limit], "total": len(out)}
