"""Currency domain services: master data, exchange-rate lookup, the base-currency guard and
platform settings. Pure maths (rounding, conversion, settlement) lives in app.core.currency —
this module is the part that needs the database."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import (
    CURRENCIES,
    ONE,
    CurrencyError,
    MissingExchangeRateError,
    UnsupportedCurrencyError,
    invert_rate,
    normalize_code,
    normalize_rate,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.currency.models import Currency, ExchangeRate, PlatformSetting
from app.modules.currency.schemas import ExchangeRateCreate
from app.modules.tenants.models import Tenant

REPORTING_CURRENCY_KEY = "reporting_currency"
DEFAULT_CURRENCY = "RWF"


# ── Master data ───────────────────────────────────────────────────────────────

async def list_currencies(db: AsyncSession, active_only: bool = True) -> list[Currency]:
    stmt = select(Currency).order_by(Currency.name)
    if active_only:
        stmt = stmt.where(Currency.is_active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def require_active_currency(db: AsyncSession, code: str | None) -> str:
    """Normalised ISO code that is both known and switched on — never a symbol."""
    c = normalize_code(code)
    row = await db.get(Currency, c)
    # Before the table is seeded (fresh checkout mid-migration) the registry is authoritative.
    if row is None and c in CURRENCIES:
        return c
    if row is None:
        raise UnsupportedCurrencyError(f"Unsupported currency '{code}'")
    if not row.is_active:
        raise CurrencyError(f"{c} is not currently enabled")
    return c


# ── Tenant base currency ──────────────────────────────────────────────────────

async def get_base_currency(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    """The tenant's accounting currency. Column select — `select(Tenant)` would eager-load every
    user/role/branch/department of the tenant."""
    code = (await db.execute(select(Tenant.currency).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if code is None:
        raise NotFoundError("Company not found")
    return normalize_code(code or DEFAULT_CURRENCY)


def document_rate(doc: object) -> Decimal:
    """A stored document's frozen document→base rate. NULL = a row from before multi-currency, which was
    recorded in base currency by construction (rate 1)."""
    rate = getattr(doc, "exchange_rate", None)
    return ONE if rate is None else Decimal(rate)


def document_currency(doc: object, base_currency: str) -> str:
    return getattr(doc, "currency_code", None) or base_currency


async def has_financial_activity(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    """Has this tenant ever recorded money? Orders, expenses, purchases, supplier bills or any
    ledger entry. One cheap EXISTS per table, short-circuiting on the first hit."""
    # Imported here, not at module level: each module's package __init__ eagerly imports its routes
    # and services, so importing their models up top makes this module part of an import cycle.
    from app.modules.accounting.models.expense import Expense
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.procurement.models.purchase_order import PurchaseOrder
    from app.modules.procurement.models.supplier_bill import SupplierBill
    from app.modules.sales.models.order import Order

    for model in (Order, Transaction, Expense, PurchaseOrder, SupplierBill):
        if (await db.execute(select(exists().where(model.tenant_id == tenant_id)))).scalar():
            return True
    return False


async def change_base_currency(db: AsyncSession, tenant_id: uuid.UUID, new_code: str) -> str:
    """Change the base (accounting) currency — only while nothing has been recorded.

    After the first transaction the base currency is frozen: flipping RWF → USD would re-read
    every historical amount (1,000,000 RWF) as dollars. A real change needs a conversion
    workflow that revalues history, which does not exist, so it is refused rather than allowed
    to corrupt the books. Returns the (unchanged or new) code. Does not commit.
    """
    new = await require_active_currency(db, new_code)
    current = await get_base_currency(db, tenant_id)
    if new == current:
        return current
    if await has_financial_activity(db, tenant_id):
        raise ValidationError(
            f"The base currency can't be changed from {current} to {new} because this business has already "
            "recorded transactions. Changing it would reinterpret every existing amount in a different currency."
        )
    await db.execute(update(Tenant).where(Tenant.id == tenant_id).values(currency=new))
    return new


# ── Exchange rates ────────────────────────────────────────────────────────────

async def _latest_rate(
    db: AsyncSession, tenant_id: uuid.UUID | None, src: str, dst: str, at: datetime,
) -> tuple[Decimal, ExchangeRate] | None:
    """Newest rate at/before `at` for the pair in one scope (a tenant's own, or platform when None),
    direct (src→dst) or inverse (dst→src, inverted). Direct wins a tie on timestamp."""
    scope = ExchangeRate.tenant_id.is_(None) if tenant_id is None else ExchangeRate.tenant_id == tenant_id
    rows = (await db.execute(
        select(ExchangeRate)
        .where(
            scope, ExchangeRate.effective_at <= at,
            ((ExchangeRate.base_currency == src) & (ExchangeRate.quote_currency == dst))
            | ((ExchangeRate.base_currency == dst) & (ExchangeRate.quote_currency == src)),
        )
        .order_by(ExchangeRate.effective_at.desc(), ExchangeRate.created_at.desc())
        .limit(2)
    )).scalars().all()
    if not rows:
        return None
    row = rows[0]
    rate = Decimal(row.rate) if row.base_currency == src else invert_rate(row.rate)
    return rate, row


async def lookup_rate(
    db: AsyncSession, tenant_id: uuid.UUID | None, from_currency: str, to_currency: str, at: datetime | None = None,
) -> tuple[Decimal, str]:
    """(rate, scope) — units of `to` per 1 `from` at `at`. Tenant rates win over platform ones; no
    rate is a MissingExchangeRateError, never a silent 1. Same currency → (1, "identity")."""
    src, dst = normalize_code(from_currency), normalize_code(to_currency)
    if src == dst:
        return ONE, "identity"
    at = at or datetime.now(UTC)
    if tenant_id is not None:
        hit = await _latest_rate(db, tenant_id, src, dst, at)
        if hit:
            return hit[0], "tenant"
    hit = await _latest_rate(db, None, src, dst, at)
    if hit:
        return hit[0], "platform"
    raise MissingExchangeRateError(
        f"No exchange rate for {src} → {dst} is set. Add one in Settings → Currency before using {src}."
    )


async def resolve_document_currency(
    db: AsyncSession, tenant_id: uuid.UUID, requested: str | None,
    explicit_rate: Decimal | float | str | None = None, at: datetime | None = None,
) -> tuple[str, Decimal, str]:
    """Settle a new document's currency context → (currency_code, rate to base, base_currency).

    No currency requested (every existing client) or the base currency → (base, 1): no conversion,
    no rate needed. A foreign currency uses the explicit rate if the user supplied one, otherwise
    the tenant/platform rate effective at `at`; with neither it fails loudly.
    """
    base = await get_base_currency(db, tenant_id)
    code = await require_active_currency(db, requested) if requested else base
    if code == base:
        if explicit_rate is not None and normalize_rate(explicit_rate) != ONE:
            raise CurrencyError(f"The exchange rate between {base} and itself must be 1")
        return code, ONE, base
    if explicit_rate is not None:
        return code, normalize_rate(explicit_rate), base
    rate, _scope = await lookup_rate(db, tenant_id, code, base, at)
    return code, rate, base


async def create_rate(
    db: AsyncSession, tenant_id: uuid.UUID | None, user_id: uuid.UUID | None, data: ExchangeRateCreate,
) -> ExchangeRate:
    base = await require_active_currency(db, data.base_currency)
    quote = await require_active_currency(db, data.quote_currency)
    if base == quote:
        raise CurrencyError("An exchange rate needs two different currencies")
    effective = data.effective_at or datetime.now(UTC)
    row = ExchangeRate(
        tenant_id=tenant_id, base_currency=base, quote_currency=quote, rate=normalize_rate(data.rate),
        effective_at=effective if effective.tzinfo else effective.replace(tzinfo=UTC), source="manual", created_by=user_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def list_rates(
    db: AsyncSession, tenant_id: uuid.UUID | None, offset: int = 0, limit: int = 50,
    base: str | None = None, quote: str | None = None,
) -> tuple[list[ExchangeRate], int]:
    from sqlalchemy import func

    scope = ExchangeRate.tenant_id.is_(None) if tenant_id is None else ExchangeRate.tenant_id == tenant_id
    filters = [scope]
    if base:
        filters.append(ExchangeRate.base_currency == normalize_code(base))
    if quote:
        filters.append(ExchangeRate.quote_currency == normalize_code(quote))
    total = (await db.execute(select(func.count()).select_from(ExchangeRate).where(*filters))).scalar_one()
    rows = (await db.execute(
        select(ExchangeRate).where(*filters)
        .order_by(ExchangeRate.effective_at.desc(), ExchangeRate.created_at.desc()).offset(offset).limit(limit)
    )).scalars().all()
    return list(rows), total


# ── Platform settings ─────────────────────────────────────────────────────────

async def get_reporting_currency(db: AsyncSession) -> str:
    """PESAA's own reporting currency for cross-tenant analytics. Independent of any tenant's base."""
    row = await db.get(PlatformSetting, REPORTING_CURRENCY_KEY)
    value = row.value if row is not None else None
    return normalize_code(value) if isinstance(value, str) and value else DEFAULT_CURRENCY


async def set_reporting_currency(db: AsyncSession, code: str, user_id: uuid.UUID | None) -> str:
    new = await require_active_currency(db, code)
    row = await db.get(PlatformSetting, REPORTING_CURRENCY_KEY)
    if row is None:
        db.add(PlatformSetting(key=REPORTING_CURRENCY_KEY, value=new, updated_by=user_id))
    else:
        row.value = new
        row.updated_by = user_id
    await db.flush()
    return new
