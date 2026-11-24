"""Branch prices and availability (``Tenant.branch_pricing``).

Rules:
* Every product keeps one default price (``Product.price``). A branch either follows it or has its own price.
* A product can be hidden in a branch: that branch's till, search and barcode scan no longer find it and every sale there
  refuses it. Stock, history and reports are untouched, and stock can still be received or transferred there.
* Only differences are stored (``ProductBranchSetting``); setting a branch back to the default removes its row, so a
  business that never uses this has no rows and nothing changes for it. Switching the feature off keeps the rows: they
  apply again when it is switched back on.
* Products with variants keep their per-variant prices: they can be hidden per branch but get no branch price.

Who may do what:
* Switching it on or off: Pesaa (Super Admin), or the business owner when Pesaa allows it (``branch_pricing_self_service``).
* Setting prices and hiding products: ``branch_prices:manage`` (owners and administrators always). Someone limited to some
  branches changes only those branches.
"""
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.inventory.models.branch_setting import ProductBranchSetting
from app.modules.inventory.models.product import Product
from app.modules.tenants.models import Branch, Tenant

OFF_MESSAGE = "Branch prices are switched off for this business. The owner can switch them on in Business Settings → Sales & pricing."
NO_PERMISSION = "You don't have permission to manage branch prices. Ask the owner for the \"Manage branch prices\" permission."
VARIANTS = "Branch prices aren't supported for products with variants yet. You can still hide '{name}' in a branch."
PERMISSION = "branch_prices:manage"


# ── Who ──────────────────────────────────────────────────────────────────────

def can_manage(user: Any) -> bool:
    return bool(user.is_superuser or (user.role or "").lower() in ("admin", "owner")
                or PERMISSION in (getattr(user, "role_permissions_names", None) or user.permissions_names))


def require_manage(user: Any) -> None:
    if not can_manage(user):
        raise ForbiddenError(NO_PERMISSION)


def own_branches(user: Any) -> set[uuid.UUID] | None:
    """The branches this person may change prices in; None = every branch (owners and people not limited to branches)."""
    if user.is_superuser:
        return None
    ids = getattr(user, "branch_ids", None)
    if ids is None:
        ids = [user.branch_id] if getattr(user, "branch_id", None) else None
    return None if ids is None else {uuid.UUID(str(i)) for i in ids if i}


# ── Switch ───────────────────────────────────────────────────────────────────

async def is_enabled(db: AsyncSession, tenant_id: uuid.UUID | None) -> bool:
    if tenant_id is None:
        return False
    return bool((await db.execute(select(Tenant.branch_pricing).where(Tenant.id == tenant_id))).scalar_one_or_none())


async def require_enabled(db: AsyncSession, tenant_id: uuid.UUID | None) -> None:
    if not await is_enabled(db, tenant_id):
        raise ForbiddenError(OFF_MESSAGE)


async def status(db: AsyncSession, user: Any) -> dict:
    """What this person sees in Business Settings and Inventory: is it on, may they switch it, may they edit, which branches."""
    tenant = await db.get(Tenant, user.tenant_id)
    mine = own_branches(user)
    branches = await _branches(db, user.tenant_id)
    return {
        "enabled": bool(tenant.branch_pricing), "self_service": bool(tenant.branch_pricing_self_service),
        "can_toggle": bool(user.is_superuser and tenant.branch_pricing_self_service),
        "can_manage": can_manage(user),
        "editable_branch_ids": [str(b.id) for b in branches if can_manage(user) and (mine is None or b.id in mine)],
    }


async def set_enabled(db: AsyncSession, user: Any, enabled: bool) -> dict:
    """The owner switches branch prices on or off. Saved prices and hidden products are kept either way."""
    if not user.is_superuser:
        raise ForbiddenError("Only the business owner can switch branch prices on or off")
    tenant = await db.get(Tenant, user.tenant_id, with_for_update=True)
    if not tenant.branch_pricing_self_service:
        raise ForbiddenError("Pesaa manages branch prices for this business. Contact Pesaa support to switch them on or off.")
    before = bool(tenant.branch_pricing)
    if before != enabled:
        tenant.branch_pricing = enabled
        from app.modules.audit.service import record_audit
        await record_audit(db, tenant_id=tenant.id, actor_user_id=user.id, actor_name=user.full_name, action="tenant.branch_pricing",
                           entity_type="tenant", entity_id=str(tenant.id),
                           summary=f"Branch prices switched {'on' if enabled else 'off'}",
                           changes={"before": {"branch_pricing": before}, "after": {"branch_pricing": enabled}})
        await db.commit()
    return await status(db, user)


# ── Reading ──────────────────────────────────────────────────────────────────

def not_hidden_at(tenant_id: uuid.UUID, branch_id: uuid.UUID):
    """A WHERE clause keeping products that are not hidden in ``branch_id``."""
    return ~exists().where(
        ProductBranchSetting.tenant_id == tenant_id, ProductBranchSetting.branch_id == branch_id,
        ProductBranchSetting.product_id == Product.id, ProductBranchSetting.is_available.is_(False),
    )


async def _branches(db: AsyncSession, tenant_id: uuid.UUID) -> list[Branch]:
    return list((await db.execute(
        select(Branch).where(Branch.tenant_id == tenant_id, Branch.status == "active")
        .order_by(Branch.is_main.desc(), Branch.name)
    )).scalars().all())


async def _settings(db: AsyncSession, tenant_id: uuid.UUID, product_ids: list[uuid.UUID],
                    branch_id: uuid.UUID | None = None) -> list[ProductBranchSetting]:
    if not product_ids:
        return []
    stmt = select(ProductBranchSetting).where(
        ProductBranchSetting.tenant_id == tenant_id, ProductBranchSetting.product_id.in_(product_ids))
    if branch_id is not None:
        stmt = stmt.where(ProductBranchSetting.branch_id == branch_id)
    return list((await db.execute(stmt)).scalars().all())


async def branch_prices(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID | None,
                        product_ids: set[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    """{product: its own price in this branch}, only for products that have one (and only while the feature is on)."""
    if branch_id is None or not product_ids or not await is_enabled(db, tenant_id):
        return {}
    return {s.product_id: Decimal(str(s.price)) for s in await _settings(db, tenant_id, list(product_ids), branch_id) if s.price is not None}


async def apply_prices(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, items: list[Any]) -> None:
    """Give each listed product (ProductRead) the price it sells at in ``branch_id``. One query for the whole page."""
    own = await branch_prices(db, tenant_id, branch_id, {i.id for i in items})
    for item in items:
        item.default_price = item.price
        if item.id in own and not item.has_variants:
            item.price = float(own[item.id])
            item.branch_price = True


async def hidden_products(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID | None,
                          product_ids: set[uuid.UUID]) -> set[uuid.UUID]:
    """Which of ``product_ids`` are hidden in ``branch_id`` (none when the business does not use branch prices)."""
    if branch_id is None or not product_ids or not await is_enabled(db, tenant_id):
        return set()
    return {s.product_id for s in await _settings(db, tenant_id, list(product_ids), branch_id) if not s.is_available}


async def refuse_hidden(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, product_ids: set[uuid.UUID]) -> None:
    """Every sale path calls this: a product hidden in the branch can't be sold there."""
    hidden = await hidden_products(db, tenant_id, branch_id, {p for p in product_ids if p})
    if hidden:
        names = (await db.execute(select(Product.name).where(Product.tenant_id == tenant_id, Product.id.in_(hidden)))).scalars().all()
        raise ValidationError(f"Not sold in this branch: {', '.join(sorted(names))}. Remove it from the sale, or ask a manager to show it in this branch.")


def _row(branch: Branch, setting: ProductBranchSetting | None, default: Decimal, editable: bool) -> dict:
    own = setting.price if setting is not None else None
    return {
        "branch_id": str(branch.id), "branch_name": branch.name, "is_main": branch.is_main,
        "is_available": setting.is_available if setting is not None else True,
        "price": float(own) if own is not None else None,
        "effective_price": float(own if own is not None else default),
        "updated_at": setting.updated_at.isoformat() if setting is not None and setting.updated_at else None,
        "editable": editable,
    }


async def _product(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID) -> Product:
    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product not found")
    return product


def _editable(user: Any, branch_id: uuid.UUID) -> bool:
    mine = own_branches(user)
    return can_manage(user) and (mine is None or branch_id in mine)


async def product_branches(db: AsyncSession, user: Any, product_id: uuid.UUID) -> dict:
    """The product's default price and cost and, for each active branch, whether it is sold there and at what price."""
    tenant_id = user.tenant_id
    await require_enabled(db, tenant_id)
    require_manage(user)
    product = await _product(db, tenant_id, product_id)
    by_branch = {s.branch_id: s for s in await _settings(db, tenant_id, [product.id])}
    from app.modules.currency.service import get_base_currency
    return {
        "product_id": str(product.id), "name": product.name, "default_price": float(product.price),
        "cost": float(product.cost), "has_variants": product.has_variants, "currency": await get_base_currency(db, tenant_id),
        "branches": [_row(b, by_branch.get(b.id), product.price, _editable(user, b.id)) for b in await _branches(db, tenant_id)],
    }


# ── Changing ─────────────────────────────────────────────────────────────────

def _money(currency: str, value: Decimal) -> str:
    return f"{currency} {value:,.0f}" if value == value.to_integral_value() else f"{currency} {value:,.2f}"


async def _apply(db: AsyncSession, user: Any, product: Product, changes: list[Any], branches: dict[uuid.UUID, Branch],
                 existing: dict[uuid.UUID, ProductBranchSetting], currency: str) -> list[dict]:
    """Apply one product's changes; returns what changed (for History and the audit log). Caller commits."""
    out: list[dict] = []
    mine = own_branches(user)
    for change in changes:
        branch = branches.get(change.branch_id)
        if branch is None:
            raise ValidationError("Choose an active branch of this business")
        if mine is not None and branch.id not in mine:
            names = ", ".join(sorted(b.name for b in branches.values() if b.id in mine)) or "your own branches"
            raise ForbiddenError(f"You can only change prices for {names}")
        row = existing.get(branch.id)
        price = change.price
        if change.keep_price:
            price = row.price if row is not None else None
        elif price is not None:
            if product.has_variants:
                raise ValidationError(VARIANTS.format(name=product.name))
            price = Decimal(str(price)).quantize(Decimal("0.01"))
            if price <= 0:
                raise ValidationError(f"Price for {branch.name} must be more than {_money(currency, Decimal(0))}. Leave it empty to use the default price.")
            cost = Decimal(str(product.cost)).quantize(Decimal("0.01"))
            if price < cost:
                raise ValidationError(f"Price for {branch.name} ({_money(currency, price)}) is below cost ({_money(currency, cost)}).")
            if price == Decimal(str(product.price)).quantize(Decimal("0.01")):
                price = None  # the same as the default: follow the default instead of copying it
        before = (row.is_available, row.price) if row is not None else (True, None)
        after = (change.is_available, price)
        if before == after:
            continue
        if after == (True, None):
            await db.execute(delete(ProductBranchSetting).where(ProductBranchSetting.id == row.id))
            existing.pop(branch.id, None)
        elif row is None:
            row = ProductBranchSetting(tenant_id=product.tenant_id, product_id=product.id, branch_id=branch.id,
                                       is_available=change.is_available, price=price, updated_by=user.id)
            db.add(row)
            existing[branch.id] = row
        else:
            row.is_available, row.price, row.updated_by = change.is_available, price, user.id
        out.append({"product_id": str(product.id), "product": product.name, "branch_id": str(branch.id), "branch": branch.name,
                    "before": {"sold": before[0], "price": float(before[1]) if before[1] is not None else "default"},
                    "after": {"sold": after[0], "price": float(after[1]) if after[1] is not None else "default"}})
    return out


def _describe(c: dict) -> str:
    parts = []
    if c["before"]["price"] != c["after"]["price"]:
        parts.append(f"price {c['before']['price']} → {c['after']['price']}")
    if c["before"]["sold"] != c["after"]["sold"]:
        parts.append("shown" if c["after"]["sold"] else "hidden")
    return f"{c['branch']}: {', '.join(parts)}"


async def _history(db: AsyncSession, user: Any, changed: list[dict]) -> None:
    """One entry per product in its History (and the audit log): who, when, which branch, old → new."""
    from app.modules.audit.service import record_audit
    by_product: dict[str, list[dict]] = {}
    for c in changed:
        by_product.setdefault(c["product_id"], []).append(c)
    for product_id, rows in by_product.items():
        await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name,
                           action="product.branch_price", entity_type="product", entity_id=product_id,
                           summary=f"Branch prices for {rows[0]['product']}: " + "; ".join(_describe(r) for r in rows)[:240],
                           changes={"branches": [{k: r[k] for k in ("branch_id", "branch", "before", "after")} for r in rows]})


async def _change(db: AsyncSession, user: Any, changes: list[Any]) -> int:
    tenant_id = user.tenant_id
    await require_enabled(db, tenant_id)
    require_manage(user)
    ids = {c.product_id for c in changes}
    products = {p.id: p for p in (await db.execute(
        select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(ids)).with_for_update(of=Product)
    )).scalars().all()}
    if set(products) != ids:
        raise NotFoundError("A product was not found in this business")
    branches = {b.id: b for b in await _branches(db, tenant_id)}
    existing: dict[uuid.UUID, dict[uuid.UUID, ProductBranchSetting]] = {}
    for s in await _settings(db, tenant_id, list(ids)):
        existing.setdefault(s.product_id, {})[s.branch_id] = s
    from app.modules.currency.service import get_base_currency
    currency = await get_base_currency(db, tenant_id)
    changed: list[dict] = []
    for pid, product in products.items():
        changed += await _apply(db, user, product, [c for c in changes if c.product_id == pid], branches, existing.setdefault(pid, {}), currency)
    await _history(db, user, changed)
    await db.commit()
    return len(changed)


async def set_product_branches(db: AsyncSession, user: Any, product_id: uuid.UUID, changes: list[Any]) -> dict:
    from app.modules.inventory.schemas.branch_pricing import BranchPriceChange
    await _change(db, user, [BranchPriceChange(product_id=product_id, **c.model_dump()) for c in changes])
    return await product_branches(db, user, product_id)


async def bulk_set(db: AsyncSession, user: Any, changes: list[Any]) -> int:
    """Many products × branches at once (the price list). All or nothing. Returns how many cells changed."""
    return await _change(db, user, changes)


async def set_visibility(db: AsyncSession, user: Any, product_ids: list[uuid.UUID], branch_id: uuid.UUID, visible: bool) -> int:
    """Show or hide many products in one branch (the products list's bulk action). Their branch prices are kept."""
    from app.modules.inventory.schemas.branch_pricing import BranchPriceChange
    return await _change(db, user, [BranchPriceChange(product_id=p, branch_id=branch_id, is_available=visible, keep_price=True) for p in product_ids])


async def price_list(db: AsyncSession, user: Any, offset: int, limit: int, search: str | None, show: str,
                     category_id: uuid.UUID | None = None) -> dict:
    """Products × branches for the price list. ``show``: all | differences | hidden."""
    tenant_id = user.tenant_id
    await require_enabled(db, tenant_id)
    require_manage(user)
    branches = await _branches(db, tenant_id)
    differs = exists().where(ProductBranchSetting.tenant_id == tenant_id, ProductBranchSetting.product_id == Product.id)
    hidden = exists().where(ProductBranchSetting.tenant_id == tenant_id, ProductBranchSetting.product_id == Product.id,
                            ProductBranchSetting.is_available.is_(False))
    own = exists().where(ProductBranchSetting.tenant_id == tenant_id, ProductBranchSetting.product_id == Product.id,
                         ProductBranchSetting.price.is_not(None))
    where = [Product.tenant_id == tenant_id, Product.is_active.is_(True)]
    if search:
        like = f"%{search.strip()}%"
        where.append(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
    if category_id is not None:
        where.append(Product.category_id == category_id)
    if show == "differences":
        where.append(differs)
    elif show == "hidden":
        where.append(hidden)
    total = (await db.execute(select(func.count()).select_from(Product).where(and_(*where)))).scalar_one()
    products = list((await db.execute(
        select(Product).where(and_(*where)).order_by(Product.name, Product.id).offset(offset).limit(limit)
    )).scalars().all())
    by_product: dict[uuid.UUID, dict[uuid.UUID, ProductBranchSetting]] = {}
    for s in await _settings(db, tenant_id, [p.id for p in products]):
        by_product.setdefault(s.product_id, {})[s.branch_id] = s
    base = [Product.tenant_id == tenant_id, Product.is_active.is_(True)]

    def count(clause):
        return select(func.count()).select_from(Product).where(and_(*base, clause))
    from app.modules.currency.service import get_base_currency
    return {
        "branches": [{"id": str(b.id), "name": b.name, "is_main": b.is_main, "editable": _editable(user, b.id)} for b in branches],
        "currency": await get_base_currency(db, tenant_id),
        "summary": {
            "products": (await db.execute(count(Product.id.is_not(None)))).scalar_one(),
            "with_own_price": (await db.execute(count(own))).scalar_one(),
            "hidden_somewhere": (await db.execute(count(hidden))).scalar_one(),
        },
        "total": total,
        "items": [{
            "id": str(p.id), "name": p.name, "sku": p.sku, "default_price": float(p.price), "cost": float(p.cost),
            "has_variants": p.has_variants,
            "branches": [_row(b, by_product.get(p.id, {}).get(b.id), p.price, _editable(user, b.id)) for b in branches],
        } for p in products],
    }
