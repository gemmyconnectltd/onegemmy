"""The money domain core: rounding, conversion direction, settlement, formatting and the platform rate book.
Pure — no database."""
from datetime import UTC, date, datetime
from decimal import Decimal as D

import pytest

from app.core.currency import (
    CURRENCIES,
    CurrencyError,
    MissingExchangeRateError,
    UnsupportedCurrencyError,
    compute_settlement,
    convert_money,
    decimal_places,
    format_money,
    invert_rate,
    normalize_code,
    normalize_rate,
    quantize,
    to_base_amount,
    to_decimal,
)
from app.core.exceptions import ValidationError
from app.modules.currency.reporting import RateBook, convert_daily


def at(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=UTC)


# ── Master data ───────────────────────────────────────────────────────────────

def test_required_currencies_exist_with_iso_decimal_places():
    for code in ("RWF", "USD", "EUR", "KES", "UGX", "TZS", "MZN", "GBP"):
        assert code in CURRENCIES
    assert decimal_places("RWF") == 0 and decimal_places("UGX") == 0 and decimal_places("JPY") == 0
    assert decimal_places("USD") == 2 and decimal_places("KES") == 2 and decimal_places("MZN") == 2
    assert decimal_places("KWD") == 3 and decimal_places("BHD") == 3


@pytest.mark.parametrize("bad", ["$", "FRw", "", None, "usdd", "XXX1"])
def test_codes_must_be_iso_codes_never_symbols(bad):
    with pytest.raises(UnsupportedCurrencyError):
        normalize_code(bad)


def test_codes_are_case_and_space_insensitive():
    assert normalize_code(" usd ") == "USD"


# ── Float safety and rounding ─────────────────────────────────────────────────

def test_floats_enter_through_str_so_binary_noise_never_leaks():
    assert to_decimal(0.1) + to_decimal(0.2) == D("0.3")
    assert quantize(0.1 + 0.2, "USD") == D("0.30")
    assert to_decimal(1.005) == D("1.005")


def test_non_finite_and_garbage_amounts_are_rejected():
    for bad in (float("nan"), float("inf"), "abc"):
        with pytest.raises(ValidationError):
            to_decimal(bad)


@pytest.mark.parametrize(
    ("amount", "code", "expected"),
    [
        ("1234.5", "RWF", D(1235)),        # zero-decimal currency: half-up to whole francs
        ("1234.49", "RWF", D(1234)),
        ("2.675", "USD", D("2.68")),         # half-up, not banker's (and not binary-float 2.67)
        ("1.0005", "KWD", D("1.001")),       # three-decimal currency
        ("-2.675", "USD", D("-2.68")),
    ],
)
def test_quantize_uses_currency_minor_unit(amount, code, expected):
    assert quantize(amount, code) == expected


# ── Conversion: direction, identity, missing rates ────────────────────────────

def test_rate_means_target_units_per_one_source_unit():
    # 1 USD = 1450 RWF
    assert convert_money(1000, "USD", "RWF", "1450") == D(1450000)
    # and the same pair read the other way: RWF → USD at the inverse rate
    assert convert_money(1450000, "RWF", "USD", invert_rate("1450")) == D("1000.00")


def test_same_currency_is_untouched_and_needs_no_rate():
    assert convert_money(100000, "RWF", "RWF") == D(100000)
    assert convert_money(100000, "RWF", "RWF", 1) == D(100000)
    assert to_base_amount("1234.56", "RWF", "RWF", None) == D("1234.56")  # base docs are never re-rounded


def test_same_currency_with_a_real_rate_is_an_error_not_a_silent_revalue():
    with pytest.raises(CurrencyError):
        convert_money(100, "RWF", "RWF", 1450)


def test_different_currencies_never_assume_a_rate_of_one():
    with pytest.raises(MissingExchangeRateError):
        convert_money(100, "USD", "RWF")
    with pytest.raises(MissingExchangeRateError):
        normalize_rate(None)


@pytest.mark.parametrize("bad", [0, -5, "0"])
def test_rates_must_be_positive(bad):
    with pytest.raises(CurrencyError):
        normalize_rate(bad)


def test_high_precision_rates_survive_and_round_once_at_the_end():
    rate = "0.0006896552"  # RWF→USD
    assert normalize_rate(rate) == D("0.0006896552")
    # 1,450,000 RWF × 0.0006896552 = 1000.00004 → USD 1000.00
    assert convert_money(1450000, "RWF", "USD", rate) == D("1000.00")
    assert convert_money(1, "USD", "RWF", "1450.123456789012") == D(1450)  # rate stored at 10 dp, result whole RWF
    assert normalize_rate("1450.123456789012") == D("1450.1234567890")


def test_unrounded_conversion_keeps_full_precision_for_intermediate_steps():
    assert convert_money(1, "USD", "RWF", "1450.5", rounded=False) == D("1450.5")
    assert convert_money(3, "USD", "KES", "129.2345", rounded=False) == D("387.7035")


def test_round_trip_through_the_original_amount_does_not_drift():
    # Always convert from the ORIGINAL amount: 1000 USD stays 1,450,000 RWF however often it is read.
    once = convert_money(1000, "USD", "RWF", "1450")
    again = convert_money(1000, "USD", "RWF", "1450")
    assert once == again == D(1450000)


def test_zero_value_conversion_is_zero():
    assert convert_money(0, "USD", "RWF", "1450") == D(0)


# ── Formatting ────────────────────────────────────────────────────────────────

def test_format_money_follows_each_currencys_decimals():
    assert format_money(1500000, "RWF") == "RWF 1,500,000"
    assert format_money(1500, "USD") == "USD 1,500.00"
    assert format_money(1500, "USD", symbol=True) == "$1,500.00"
    assert format_money("1.5", "KWD") == "KWD 1.500"
    assert format_money(-25000, "RWF") == "RWF -25,000"
    assert format_money(1234.5, "RWF") == "RWF 1,235"


# ── Settlement ────────────────────────────────────────────────────────────────

INV = {"doc_currency": "USD", "base_currency": "RWF", "doc_rate": "1450", "doc_total": "1000", "doc_base_total": "1450000"}


def test_usd_partial_payment_at_a_different_rate_books_realised_fx():
    s = compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="USD", pay_amount="400", rate_at_payment="1470")
    assert s.applied_amount == D("400.00")          # USD off the invoice
    assert s.base_amount == D(588000)             # RWF actually received (400 × 1470)
    assert s.base_applied_amount == D(580000)     # receivable cleared at the invoice rate (400 × 1450)
    assert s.fx_difference == D(8000)             # received more RWF than was carried → gain
    assert s.payment_rate == D(1470)
    assert not s.settles_in_full


def test_outstanding_stays_in_invoice_currency():
    first = compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="USD", pay_amount="400", rate_at_payment="1470")
    # 1000 − 400 = 600 USD left; never "1000 USD − 588,000 RWF"
    assert D(1000) - first.applied_amount == D("600.00")


def test_final_payment_clears_the_receivable_exactly():
    first = compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="USD", pay_amount="400", rate_at_payment="1470")
    last = compute_settlement(
        **INV, paid_so_far=first.applied_amount, base_applied_so_far=first.base_applied_amount,
        pay_currency="USD", pay_amount="600", rate_at_payment="1430",
    )
    assert last.settles_in_full
    assert first.base_applied_amount + last.base_applied_amount == D(1450000)   # AR carrying value fully cleared
    assert last.base_amount == D(858000)
    assert last.fx_difference == D(858000) - D(870000)                         # 600×1430 − 600×1450 = loss of 12,000
    assert last.fx_difference == D(-12000)


def test_paying_a_usd_invoice_in_base_currency_converts_at_the_payment_date_rate():
    s = compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="RWF", pay_amount="725000", rate_at_payment="1450")
    assert s.base_amount == D(725000)
    assert s.applied_amount == D("500.00")          # 725,000 ÷ 1450
    assert s.payment_rate == D(1)                 # paid in base: payment currency IS base
    assert s.fx_difference == D(0)


def test_paying_a_base_currency_invoice_in_foreign_cash():
    s = compute_settlement(
        doc_currency="RWF", base_currency="RWF", doc_rate=1, doc_total="1000000", doc_base_total="1000000",
        paid_so_far=0, base_applied_so_far=0, pay_currency="USD", pay_amount="500", rate_at_payment="1450",
    )
    assert s.base_amount == D(725000) and s.applied_amount == D(725000)
    assert s.payment_rate == D(1450)
    assert s.fx_difference == D(0)                # no FX on a base-currency receivable


def test_same_currency_payment_has_no_fx_and_no_rate_needed():
    s = compute_settlement(
        doc_currency="RWF", base_currency="RWF", doc_rate=1, doc_total="100000", doc_base_total="100000",
        paid_so_far=0, base_applied_so_far=0, pay_currency="RWF", pay_amount="40000",
    )
    assert (s.applied_amount, s.base_amount, s.base_applied_amount, s.fx_difference) == (D(40000), D(40000), D(40000), D(0))


def test_foreign_invoice_paid_in_a_third_currency_is_rejected():
    with pytest.raises(CurrencyError):
        compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="EUR", pay_amount="100", rate_at_payment="1500")


def test_foreign_payment_without_a_rate_is_an_error():
    with pytest.raises(MissingExchangeRateError):
        compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="USD", pay_amount="100")


def test_overpayment_and_zero_payment_are_rejected():
    with pytest.raises(ValidationError):
        compute_settlement(**INV, paid_so_far="900", base_applied_so_far="1305000", pay_currency="USD", pay_amount="200", rate_at_payment="1450")
    with pytest.raises(ValidationError):
        compute_settlement(**INV, paid_so_far=0, base_applied_so_far=0, pay_currency="USD", pay_amount="0", rate_at_payment="1450")


def test_one_unit_of_rounding_dust_still_settles_in_full():
    # 999.995 USD owed after rounding shows up as 1000.00; paying in RWF can land a cent short.
    s = compute_settlement(
        **INV, paid_so_far=0, base_applied_so_far=0, pay_currency="RWF", pay_amount="1449999", rate_at_payment="1450",
    )
    assert s.settles_in_full and s.applied_amount == D("1000.00")
    assert s.base_applied_amount == D(1450000)


def test_zero_decimal_document_currency_rounds_to_whole_units():
    s = compute_settlement(
        doc_currency="UGX", base_currency="KES", doc_rate="0.035", doc_total="100000", doc_base_total="3500",
        paid_so_far=0, base_applied_so_far=0, pay_currency="UGX", pay_amount="40000.6", rate_at_payment="0.036",
    )
    assert s.applied_amount == D(40001)           # whole UGX
    assert s.base_amount == D("1440.04")            # KES has cents


# ── Platform rate book / cross-tenant conversion ──────────────────────────────

def book(*rows, reporting="RWF"):
    b = RateBook(reporting)
    for base, quote, rate, when in rows:
        b.add(base, quote, D(rate), when)
    return b.freeze()


def test_rate_book_uses_the_rate_in_force_on_the_day():
    b = book(("USD", "RWF", "1450", at(2026, 9, 1)), ("USD", "RWF", "1470", at(2026, 10, 1)))
    assert b.rate_at("USD", at(2026, 9, 30)) == D(1450)
    assert b.rate_at("USD", at(2026, 10, 1, 12)) == D(1470)
    assert b.rate_at("USD", at(2026, 8, 31)) is None            # before any rate: unknown, not 1
    assert b.rate_at("RWF", at(2026, 8, 31)) == D(1)           # the reporting currency itself


def test_rate_book_inverts_reverse_pairs_and_ignores_unrelated_ones():
    b = book(("RWF", "USD", "0.0006896552", at(2026, 9, 1)), ("USD", "EUR", "0.9", at(2026, 9, 1)))
    assert b.rate_at("USD", at(2026, 9, 2)) == invert_rate("0.0006896552")
    assert b.rate_at("EUR", at(2026, 9, 2)) is None


def test_different_currency_tenants_convert_into_one_comparable_total():
    b = book(("USD", "RWF", "1450", at(2026, 9, 1)), ("KES", "RWF", "11.2", at(2026, 9, 1)))
    rows = [("RWF", date(2026, 9, 10), D(2000000)), ("USD", date(2026, 9, 10), D(1000)), ("KES", date(2026, 9, 11), D(50000))]
    result = convert_daily(rows, b)
    # 2,000,000 + 1000×1450 + 50,000×11.2 = 2,000,000 + 1,450,000 + 560,000 — NOT 2,051,000
    assert result.total == D(4010000)
    assert not result.partial
    assert result.lines["USD"].original == D(1000) and result.lines["USD"].converted == D(1450000)


def test_a_currency_with_no_rate_is_excluded_and_flagged_never_assumed_one():
    b = book(("USD", "RWF", "1450", at(2026, 9, 1)))
    rows = [("RWF", date(2026, 9, 10), D(1000)), ("MZN", date(2026, 9, 10), D(21500))]
    result = convert_daily(rows, b)
    assert result.total == D(1000)                       # the 21,500 MZN is NOT added as if it were RWF
    assert result.partial and result.missing_rates == ["MZN"]
    assert result.lines["MZN"].original == D(21500) and result.lines["MZN"].unconverted == D(21500)


def test_historical_conversion_is_not_repriced_by_a_later_rate():
    rows = [("USD", date(2026, 9, 10), D(1000))]
    before = convert_daily(rows, book(("USD", "RWF", "1450", at(2026, 9, 1))))
    after = convert_daily(rows, book(("USD", "RWF", "1450", at(2026, 9, 1)), ("USD", "RWF", "1600", at(2026, 10, 5))))
    assert before.total == after.total == D(1450000)


def test_days_before_the_first_rate_are_flagged_while_later_days_convert():
    b = book(("USD", "RWF", "1450", at(2026, 9, 5)))
    rows = [("USD", date(2026, 9, 1), D(100)), ("USD", date(2026, 9, 10), D(100))]
    result = convert_daily(rows, b)
    assert result.total == D(145000)
    assert result.lines["USD"].unconverted == D(100) and result.partial
