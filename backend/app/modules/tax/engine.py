"""The one VAT calculator. Pure: no database, exact decimals, half-up to the cent.

Every sales and purchase flow prices its lines (after discounts) and passes them here with each line's VAT treatment.
The result is a per-line snapshot (treatment, rate, taxable base, VAT, gross) that is stored on the document and never
recomputed from product settings later.

Treatments are kept apart on purpose:
- standard     taxable at the business's standard rate (18% in Rwanda)
- zero_rated   a taxable supply at 0%: counted as taxable turnover, no VAT charged
- exempt       not taxable: no VAT, reported as exempt turnover (never as zero-rated)
- out_of_scope outside the VAT system altogether: no VAT, reported separately again
- not_registered  the business was not VAT-registered when it sold: no VAT charged on anything
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

STANDARD, ZERO_RATED, EXEMPT, OUT_OF_SCOPE, NOT_REGISTERED = "standard", "zero_rated", "exempt", "out_of_scope", "not_registered"
TREATMENTS = (STANDARD, ZERO_RATED, EXEMPT, OUT_OF_SCOPE)  # what a product can be classified as
LABELS = {STANDARD: "Standard", ZERO_RATED: "Zero-rated", EXEMPT: "Exempt", OUT_OF_SCOPE: "Out of scope", NOT_REGISTERED: "No VAT (not registered)"}
INCLUSIVE, EXCLUSIVE = "inclusive", "exclusive"

CENT = Decimal("0.01")
ZERO = Decimal(0)


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class TaxLine:
    ref: str
    amount: Decimal  # what the line sells for after every discount, in the business's pricing mode
    treatment: str | None  # None = product not reviewed yet: priced as standard, exactly as before classification existed
    tax_code: str | None = None


@dataclass
class TaxedLine:
    ref: str
    treatment: str
    tax_code: str | None
    rate: Decimal
    taxable_base: Decimal  # the amount before VAT
    tax: Decimal
    gross: Decimal  # what the customer pays for the line

    def dump(self) -> dict:
        return {"ref": self.ref, "treatment": self.treatment, "tax_code": self.tax_code, "rate": str(self.rate),
                "taxable_base": str(self.taxable_base), "tax": str(self.tax), "gross": str(self.gross)}


@dataclass
class TaxResult:
    mode: str
    registered: bool
    lines: list[TaxedLine]
    net: Decimal = ZERO  # sum of taxable bases
    tax: Decimal = ZERO
    gross: Decimal = ZERO  # the document total
    breakdown: dict[str, dict[str, Decimal]] = field(default_factory=dict)  # per treatment: base, tax, gross

    def dump(self) -> dict:
        return {"mode": self.mode, "registered": self.registered, "net": str(self.net), "tax": str(self.tax), "gross": str(self.gross),
                "lines": [ln.dump() for ln in self.lines],
                "breakdown": {k: {kk: str(vv) for kk, vv in v.items()} for k, v in self.breakdown.items()}}


def rate_for(treatment: str, standard_rate: Decimal) -> Decimal:
    return Decimal(standard_rate) if treatment == STANDARD else ZERO


def calculate(lines: list[TaxLine], *, registered: bool, standard_rate: Decimal, mode: str = INCLUSIVE) -> TaxResult:
    """Tax each line on its own (so a cart can mix 18%, 0%, exempt and out-of-scope items) and add the lines up.

    Inclusive pricing: the amount already contains VAT; VAT = amount x rate / (100 + rate) and the total does not change.
    Exclusive pricing: VAT = amount x rate / 100 is added on top. VAT is rounded half-up to the cent once per treatment and
    shared over that treatment's lines to the cent; document totals are the sums of the lines, so lines, totals,
    ledger and reports always agree."""
    if mode not in (INCLUSIVE, EXCLUSIVE):
        raise ValueError("Pricing mode must be inclusive or exclusive")
    rate_std = Decimal(str(standard_rate))
    if not rate_std.is_finite() or rate_std < 0 or rate_std >= 100:
        raise ValueError("The standard VAT rate must be between 0 and 100")
    prepared: list[tuple[TaxLine, Decimal, str]] = []
    for ln in lines:
        amount = money(ln.amount)
        if amount < 0:
            raise ValueError("A line amount cannot be negative")
        if ln.treatment is not None and ln.treatment not in TREATMENTS:
            raise ValueError(f"Unknown VAT treatment: {ln.treatment}")
        prepared.append((ln, amount, (ln.treatment or STANDARD) if registered else NOT_REGISTERED))
    # VAT is rounded once per treatment (as a single-rate document always was) and then shared over that
    # treatment's lines to the cent, so an all-standard cart gives exactly the VAT it gave before line-level VAT.
    taxes: dict[int, Decimal] = {}
    for treatment in dict.fromkeys(t for _, _, t in prepared):
        idx = [i for i, (_, _, t) in enumerate(prepared) if t == treatment]
        rate = rate_for(treatment, rate_std)
        group = sum((prepared[i][1] for i in idx), ZERO)
        if not rate:
            group_tax = ZERO
        elif mode == INCLUSIVE:
            group_tax = money(group * rate / (100 + rate))
        else:
            group_tax = money(group * rate / 100)
        for i, share in zip(idx, allocate([prepared[i][1] for i in idx], group_tax) if group_tax else [ZERO] * len(idx), strict=True):
            taxes[i] = share
    out: list[TaxedLine] = []
    for i, (ln, amount, treatment) in enumerate(prepared):
        tax, rate = taxes[i], rate_for(treatment, rate_std)
        base, gross = (amount - tax, amount) if mode == INCLUSIVE else (amount, amount + tax)
        out.append(TaxedLine(ln.ref, treatment, ln.tax_code if registered else None, rate, base, tax, gross))
    result = TaxResult(mode=mode, registered=registered, lines=out)
    for ln in out:
        result.net += ln.taxable_base
        result.tax += ln.tax
        result.gross += ln.gross
        bucket = result.breakdown.setdefault(ln.treatment, {"base": ZERO, "tax": ZERO, "gross": ZERO})
        bucket["base"] += ln.taxable_base
        bucket["tax"] += ln.tax
        bucket["gross"] += ln.gross
    return result


def allocate(amounts: list[Decimal], total: Decimal) -> list[Decimal]:
    """Spread an order-level discount over the lines in proportion to their value, to the cent, with the rounding
    remainder going to the largest lines first, so the shares always add up to exactly `total`."""
    total = money(total)
    weights = [money(a) for a in amounts]
    whole = sum(weights, ZERO)
    if total <= 0 or whole <= 0:
        return [ZERO for _ in amounts]
    if total > whole:
        raise ValueError("The discount cannot exceed the subtotal")
    raw = [w * total / whole for w in weights]
    shares = [r.quantize(CENT, rounding="ROUND_DOWN") for r in raw]
    left = int((total - sum(shares, ZERO)) / CENT)
    order = sorted(range(len(raw)), key=lambda i: (raw[i] - shares[i], weights[i]), reverse=True)
    for i in order[:left]:
        shares[i] += CENT
    return shares


def reverse(taxable_base: Decimal, tax: Decimal, gross: Decimal, returned_gross: Decimal) -> tuple[Decimal, Decimal]:
    """The VAT to reverse when part of a line comes back: the line's own recorded VAT, in proportion to what is refunded
    (never today's rate). Returns (base, tax) of the refund."""
    gross, returned_gross = money(gross), money(returned_gross)
    if gross <= 0 or returned_gross <= 0:
        return ZERO, ZERO
    share = min(returned_gross / gross, Decimal(1))
    tax_back = money(Decimal(str(tax)) * share)
    return returned_gross - tax_back, tax_back
