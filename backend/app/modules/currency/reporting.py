"""Cross-tenant money comparison for platform (super-admin) analytics — pure logic, no database.

Tenants keep their books in different base currencies, so platform totals must never add raw amounts
together. Instead each tenant-currency amount is converted into the platform *reporting currency*
with the platform exchange rate that was in force on the day the sales happened, then summed.

A currency with no usable rate is never assumed to be 1: its amounts stay out of the converted total,
are reported in `missing_rates`, and the result is flagged `partial` so the UI can say so.
"""
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from app.core.currency import ZERO, convert_money, invert_rate, normalize_code, quantize


class RateBook:
    """Platform rates into one reporting currency, looked up as-of a moment.

    Built from rows of ``1 base = rate quote``; a row is useful when one side is the reporting
    currency — direct rows (``src→reporting``) are used as-is, inverse rows (``reporting→src``) are
    inverted. Per source currency the newest rate at or before the moment wins.
    """

    def __init__(self, reporting_currency: str) -> None:
        self.reporting = normalize_code(reporting_currency)
        self._series: dict[str, list[tuple[datetime, Decimal]]] = {}

    def add(self, base: str, quote: str, rate: Decimal, effective_at: datetime) -> None:
        base, quote = normalize_code(base), normalize_code(quote)
        if quote == self.reporting and base != self.reporting:
            src, to_reporting = base, Decimal(rate)
        elif base == self.reporting and quote != self.reporting:
            src, to_reporting = quote, invert_rate(rate)
        else:
            return  # not a pair into the reporting currency
        self._series.setdefault(src, []).append((effective_at, to_reporting))

    def freeze(self) -> RateBook:
        for series in self._series.values():
            series.sort(key=lambda p: p[0])
        return self

    def rate_at(self, currency: str, at: datetime) -> Decimal | None:
        """Units of reporting currency per 1 `currency` on `at`; 1 for the reporting currency itself;
        None when no rate existed yet."""
        c = normalize_code(currency)
        if c == self.reporting:
            return Decimal(1)
        series = self._series.get(c)
        if not series:
            return None
        idx = bisect_right([t for t, _ in series], at)
        return series[idx - 1][1] if idx else None


def end_of_day(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=UTC) + timedelta(days=1) - timedelta(microseconds=1)


@dataclass
class CurrencyLine:
    currency: str
    original: Decimal = ZERO       # in the tenants' own currency
    converted: Decimal = ZERO      # in the reporting currency — only the days a rate existed
    unconverted: Decimal = ZERO    # original amount of days with no rate

    @property
    def fully_converted(self) -> bool:
        return self.unconverted == 0


@dataclass
class ConvertedTotal:
    reporting_currency: str
    total: Decimal = ZERO
    lines: dict[str, CurrencyLine] = field(default_factory=dict)

    @property
    def missing_rates(self) -> list[str]:
        return sorted(c for c, line in self.lines.items() if not line.fully_converted)

    @property
    def partial(self) -> bool:
        return bool(self.missing_rates)


def convert_daily(rows: list[tuple[str, date, Decimal]], book: RateBook) -> ConvertedTotal:
    """Convert ``(currency, day, amount)`` rows to the book's reporting currency, one day at a time.

    Each day uses that day's rate, so a currency that moved during the period is valued as it
    happened, and the same inputs always give the same output (history never re-prices).
    Amounts are converted individually and summed in the reporting currency's minor unit — never
    summed across currencies first.
    """
    out = ConvertedTotal(reporting_currency=book.reporting)
    for currency, day, amount in rows:
        code = normalize_code(currency)
        line = out.lines.setdefault(code, CurrencyLine(code))
        value = Decimal(amount)
        line.original += value
        rate = book.rate_at(code, end_of_day(day))
        if rate is None:
            line.unconverted += value
            continue
        converted = convert_money(value, code, book.reporting, None if code == book.reporting else rate)
        line.converted += converted
        out.total += converted
    out.total = quantize(out.total, book.reporting)
    return out
