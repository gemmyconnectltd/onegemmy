"""Pure, integer-only financial rules. All amounts are ISO currency minor units."""

import calendar
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.core.exceptions import ValidationError
from app.modules.billing.schemas import PriceTerms


def rounded(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def rounded_ratio(numerator: int, denominator: int) -> int:
    if denominator <= 0:
        raise ValueError("Denominator must be positive")
    sign = -1 if numerator < 0 else 1
    return sign * ((2 * abs(numerator) + denominator) // (2 * denominator))


def next_period(start: datetime, cycle: str, anchor_day: int | None = None) -> datetime:
    months = 12 if cycle == "annual" else 1
    y, m = divmod(start.year * 12 + start.month - 1 + months, 12)
    return start.replace(
        year=y, month=m + 1, day=min(anchor_day or start.day, calendar.monthrange(y, m + 1)[1])
    )


def cost(terms: dict, cycle: str, users: int, branches: int, discount_bps: int = 0) -> dict:
    p = PriceTerms.model_validate(terms)
    multiplier = 12 if cycle == "annual" else 1
    extra = max(0, users - p.included_users) if p.bill_active_users else 0
    extra_branches = max(0, branches - p.included_branches)
    gross = p.annual if cycle == "annual" else p.monthly
    gross += multiplier * (extra * p.seat_monthly + extra_branches * p.branch_monthly)
    discount = rounded_ratio(gross * discount_bps, 10000)
    subtotal = gross - discount
    tax = rounded_ratio(subtotal * p.tax_bps, 10000)
    if subtotal + tax > 9007199254740991:
        raise ValidationError("Recurring amount exceeds the supported billing maximum")
    return {"subtotal": subtotal, "discount": discount, "tax": tax, "total": subtotal + tax}


def proration(before: int, after: int, start: datetime, end: datetime, now: datetime) -> int:
    # Integer microseconds preserve precision, including tiny periods and negative credits.
    def micros(delta: timedelta) -> int:
        return delta.days * 86400000000 + delta.seconds * 1000000 + delta.microseconds

    duration = max(1, micros(end - start))
    remaining = max(0, min(duration, micros(end - now)))
    return rounded_ratio((after - before) * remaining, duration)
