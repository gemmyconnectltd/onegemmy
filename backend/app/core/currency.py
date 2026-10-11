"""Money and currency domain core — the ONE place amounts are rounded, converted and settled.

Vocabulary used across the codebase:

* **Base currency** — the tenant's accounting currency (``tenants.currency``). The ledger, VAT
  records and every report are in it.
* **Document / transaction currency** — the currency an invoice, bill, expense or payment is
  denominated in. Never destroyed: the original amount is always stored alongside its base value.
* **Exchange rate** — ``rate`` always means *units of the target currency per 1 unit of the source
  currency*. ``1 USD = 1450 RWF`` is ``rate=1450`` for ``USD → RWF``. A document's ``exchange_rate``
  is its document-currency → base rate, frozen when the document became financially effective, so
  history never silently re-prices when today's rate changes.

Everything here is ``Decimal``. Floats are accepted at the boundary only (via ``to_decimal``) and are
read through ``str()`` so binary artefacts (0.1 + 0.2) never leak into money.
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext

from app.core.currency_data import CURRENCY_DATA
from app.core.exceptions import ValidationError

ZERO = Decimal(0)
ONE = Decimal(1)

# Matches Numeric(20, 10) on every exchange_rate column.
RATE_PLACES = 10
_RATE_QUANT = Decimal(1).scaleb(-RATE_PLACES)
MAX_RATE = Decimal(9999999999)  # fits Numeric(20, 10)


class CurrencyError(ValidationError):
    """Base for currency problems that are the caller's to fix (422)."""


class UnsupportedCurrencyError(CurrencyError):
    detail = "Unsupported currency"


class MissingExchangeRateError(CurrencyError):
    detail = "No exchange rate available"


@dataclass(frozen=True)
class Currency:
    code: str
    name: str
    symbol: str
    decimal_places: int


CURRENCIES: dict[str, Currency] = {c[0]: Currency(*c) for c in CURRENCY_DATA}


# ── Codes and precision ───────────────────────────────────────────────────────

def normalize_code(code: str | None) -> str:
    """Upper-cased ISO code, or UnsupportedCurrencyError. Never accepts a symbol ("$")."""
    c = (code or "").strip().upper()
    if c not in CURRENCIES:
        raise UnsupportedCurrencyError(f"Unsupported currency '{code}'" if code else "A currency is required")
    return c


def decimal_places(code: str) -> int:
    return CURRENCIES[normalize_code(code)].decimal_places


def to_decimal(value: Decimal | float | str | None) -> Decimal:
    """Float-safe Decimal. ``0.1`` → ``Decimal('0.1')`` (via str), not the 55-digit binary expansion."""
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        d = value
    else:
        try:
            d = Decimal(str(value))
        except InvalidOperation as exc:
            raise ValidationError(f"Invalid amount '{value}'") from exc
    if not d.is_finite():
        raise ValidationError("Amount must be a finite number")
    return d


def quantize(amount: Decimal | float | str, code: str) -> Decimal:
    """Round to the currency's minor unit (RWF → whole, USD → cents, KWD → 3dp), half-up.

    This is the ONLY place money is rounded. Round once, at the end of a calculation — never on
    intermediate values — so converting A→B and back, or summing many conversions, doesn't drift.
    """
    places = decimal_places(code)
    with localcontext() as ctx:
        ctx.prec = 40
        return to_decimal(amount).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


# ── Exchange rates and conversion ─────────────────────────────────────────────

def normalize_rate(rate: Decimal | float | str | None) -> Decimal:
    """A positive rate at storage precision. Raises rather than guessing."""
    if rate is None:
        raise MissingExchangeRateError("An exchange rate is required")
    r = to_decimal(rate)
    if r <= 0:
        raise CurrencyError("Exchange rate must be greater than zero")
    if r > MAX_RATE:
        raise CurrencyError("Exchange rate is too large")
    with localcontext() as ctx:
        ctx.prec = 40
        q = r.quantize(_RATE_QUANT, rounding=ROUND_HALF_UP)
    if q <= 0:
        raise CurrencyError("Exchange rate is too small to store")
    return q


def invert_rate(rate: Decimal | float | str) -> Decimal:
    """``USD→RWF 1450`` ↔ ``RWF→USD 0.0006896552``. Use when only the opposite pair is stored."""
    with localcontext() as ctx:
        ctx.prec = 40
        return normalize_rate(ONE / normalize_rate(rate))


def convert_money(
    amount: Decimal | float | str,
    from_currency: str,
    to_currency: str,
    rate: Decimal | float | str | None = None,
    *,
    rounded: bool = True,
) -> Decimal:
    """Convert ``amount`` of ``from_currency`` into ``to_currency``. The single conversion formula.

    ``rate`` is units of ``to_currency`` per 1 ``from_currency``. Same currency → no conversion
    (``rate`` may be omitted or 1). Different currencies with no usable rate → MissingExchangeRateError;
    a rate of 1 is *never* assumed between different currencies.

    ``rounded=False`` keeps full precision for intermediate steps; always convert from the original
    amount, not from an already-converted one.
    """
    src, dst = normalize_code(from_currency), normalize_code(to_currency)
    value = to_decimal(amount)
    if src == dst:
        if rate is not None and normalize_rate(rate) != ONE:
            raise CurrencyError(f"The exchange rate between {src} and itself must be 1")
        return quantize(value, dst) if rounded else value
    if rate is None:
        raise MissingExchangeRateError(f"No exchange rate for {src} → {dst}")
    with localcontext() as ctx:
        ctx.prec = 40
        out = value * normalize_rate(rate)
    return quantize(out, dst) if rounded else out


def to_base_amount(
    value: Decimal | float | str, currency_code: str, base_currency: str, rate: Decimal | float | str | None,
) -> Decimal:
    """A document amount in the tenant's base currency at the document's frozen rate.

    Same currency → the amount untouched (existing base-currency documents behave exactly as before,
    with no re-rounding). Foreign → ``convert_money``: the single formula, rounded once to the base
    currency's minor unit."""
    if currency_code == base_currency:
        return to_decimal(value)
    return convert_money(value, currency_code, base_currency, rate)


# ── Formatting (server-side: PDFs, exports) ───────────────────────────────────

def format_money(amount: Decimal | float | str | None, code: str, *, symbol: bool = False) -> str:
    """"RWF 1,500,000" / "USD 1,500.00" / "KWD 1.500". Code-prefixed by default because it is
    unambiguous; ``symbol=True`` uses the display symbol ("$1,500.00") where that is acceptable."""
    c = CURRENCIES[normalize_code(code)]
    q = quantize(to_decimal(amount), c.code)
    body = f"{abs(q):,.{c.decimal_places}f}"
    sign = "-" if q < 0 else ""
    return f"{sign}{c.symbol}{body}" if symbol else f"{c.code} {sign}{body}"


# ── Settlement (payments against a foreign-currency invoice or bill) ──────────

@dataclass(frozen=True)
class Settlement:
    """How one payment lands, in all three currencies' worth of context."""
    applied_amount: Decimal       # reduces the document's outstanding balance — in DOCUMENT currency
    base_amount: Decimal          # cash actually received/paid, in BASE currency, at the payment-date rate
    base_applied_amount: Decimal  # receivable/payable carrying value cleared, in BASE, at the DOCUMENT's rate
    fx_difference: Decimal        # base_amount − base_applied_amount (realised FX; sign is the caller's to read)
    payment_rate: Decimal         # payment currency → base rate to store on the payment row (1 when paid in base)
    settles_in_full: bool


def compute_settlement(
    *,
    doc_currency: str,
    base_currency: str,
    doc_rate: Decimal | float | str,
    doc_total: Decimal | float | str,
    doc_base_total: Decimal | float | str,
    paid_so_far: Decimal | float | str,
    base_applied_so_far: Decimal | float | str,
    pay_currency: str,
    pay_amount: Decimal | float | str,
    rate_at_payment: Decimal | float | str | None = None,
) -> Settlement:
    """Apply one payment to an invoice/bill. Pure — no DB, no side effects, no hidden rounding.

    ``rate_at_payment`` is the one rate the conversion needs on the payment date:

    * paying a foreign document in its own currency (D) → ``D→base``
      ``applied = amount``;  ``base_amount = amount × rate``
    * paying a foreign document in base currency (B)    → ``D→base``
      ``base_amount = amount``;  ``applied = amount ÷ rate``
    * paying a base-currency document in foreign cash (P) → ``P→base``
      ``base_amount = amount × rate``;  ``applied = base_amount``

    Any other combination (a foreign document paid in a *third* currency) is rejected: it would
    need two rates and silently routing it through base would hide a conversion.

    The receivable/payable carrying value cleared is always taken at the *document's* frozen rate,
    so the ledger balance clears exactly; the difference to what was really received is the realised
    FX gain/loss. A payment that settles the balance clears the remaining carrying value exactly,
    leaving no one-unit residue from rounding.
    """
    doc_ccy, base_ccy, pay_ccy = normalize_code(doc_currency), normalize_code(base_currency), normalize_code(pay_currency)
    foreign_doc = doc_ccy != base_ccy
    if foreign_doc and pay_ccy not in (doc_ccy, base_ccy):
        raise CurrencyError(f"A {doc_ccy} document can be paid in {doc_ccy} or {base_ccy}, not {pay_ccy}")
    amount = to_decimal(pay_amount)
    if amount <= 0:
        raise ValidationError("Payment amount must be greater than zero")

    # Does this payment need a rate at all? Only when money changes currency.
    needs_rate = foreign_doc or pay_ccy != base_ccy
    r = normalize_rate(rate_at_payment) if needs_rate else ONE

    with localcontext() as ctx:
        ctx.prec = 40
        if not foreign_doc and pay_ccy == base_ccy:     # same currency throughout
            applied = base_amount = quantize(amount, base_ccy)
            payment_rate = ONE
        elif not foreign_doc:                           # base document, foreign cash (P→base)
            base_amount = quantize(amount * r, base_ccy)
            applied = base_amount
            payment_rate = r
        elif pay_ccy == doc_ccy:                        # foreign document, paid in its own currency
            applied = quantize(amount, doc_ccy)
            base_amount = quantize(applied * r, base_ccy)
            payment_rate = r
        else:                                           # foreign document, paid in base currency
            base_amount = quantize(amount, base_ccy)
            applied = quantize(base_amount / r, doc_ccy)
            payment_rate = ONE

        outstanding = quantize(to_decimal(doc_total) - to_decimal(paid_so_far), doc_ccy)
        one_unit = Decimal(1).scaleb(-decimal_places(doc_ccy))
        if applied > outstanding + one_unit:
            raise ValidationError(f"Payment of {applied} {doc_ccy} exceeds the remaining balance of {outstanding} {doc_ccy}")
        full = outstanding > 0 and applied >= outstanding - one_unit
        if full:
            applied = outstanding
            base_applied = quantize(to_decimal(doc_base_total) - to_decimal(base_applied_so_far), base_ccy)
        else:
            base_applied = quantize(applied * normalize_rate(doc_rate), base_ccy)
        if not foreign_doc:
            # One currency end to end: what was applied is what was received — no FX can arise.
            base_applied = base_amount if not full else base_applied

    return Settlement(applied, base_amount, base_applied, base_amount - base_applied, payment_rate, full)
