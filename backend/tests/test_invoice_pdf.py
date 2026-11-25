"""The A4 invoice PDF: the business's own document, one status, only the data that exists, and the receipt's closing
("Thank you for shopping with …", "Powered by Pesaa" once, at the end).

Built from plain objects shaped like OrderRead, uncompressed and in the built-in font so the text can be read in the bytes."""
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace as N

import pytest
from reportlab import rl_config

import app.main  # noqa: F401  (registers every model before the PDF module imports sales services)
from app.modules.sales.service.invoice_pdf import _build_pdf

TENANT = N(name="QA-Kigali Print House", logo_url=None, brand_color="#0F766E", currency="RWF", address="KN 4 Ave", city="Kigali", country="Rwanda",
           phone="+250788000000", email="hello@example.test", website=None, tin="100200300", vat_enabled=True, vat_number=None,
           vat_pricing_mode="inclusive", quotation_terms="Bank of Kigali · Account 000123456\nMoMo pay code 123456")


def item(name, qty, price, *, discount=0, treatment="standard", rate=18.0, sku=None):
    gross = qty * price - discount
    tax = round(gross - gross / (1 + rate / 100), 2) if treatment == "standard" else 0.0
    return N(product_name=name, sku=sku, quantity=qty, unit_price=price, discount=discount, line_total=gross, variant_attributes=None,
             tax_treatment=treatment, tax_rate=rate if treatment == "standard" else 0.0, taxable_base=round(gross - tax, 2), tax_amount=tax)


def order(**kw):
    items = kw.pop("items")
    total = sum(i.line_total for i in items) - kw.get("discount", 0)
    base = {"order_number": "QA-ORD-0001", "ordered_at": datetime(2026, 11, 24, 9, 30, tzinfo=UTC), "customer": None, "items": items, "status": "Completed",
                "subtotal": sum(i.line_total for i in items), "discount": 0, "tax": round(sum(i.tax_amount or 0 for i in items), 2), "total": total,
                "notes": None, "payment_method": "cash", "salesperson_name": "QA-Alice", "amount_paid": total, "outstanding_balance": 0, "due_date": None,
                "payment_status": "Paid", "is_overdue": False, "payments": [], "currency_code": "RWF", "exchange_rate": None, "base_total": None}
    base.update(kw)
    return N(**base)


def text(pdf: bytes) -> str:
    """The text drawn on the pages, from the uncompressed content streams (Tj strings and TJ arrays)."""
    parts = re.findall(rb"\((.*?)\) Tj", pdf)
    parts += [b"".join(re.findall(rb"\((.*?)\)", chunk)) for chunk in re.findall(rb"\[(.*?)\] TJ", pdf)]
    return b" ".join(parts).decode("latin-1")


@pytest.fixture(autouse=True)
def plain_pdf(monkeypatch):
    monkeypatch.setattr(rl_config, "pageCompression", 0)


def paid_walk_in():
    lines = [item("QA-A4 paper ream", 2, 5000, sku="QA-A4-80")]
    return order(items=lines, payments=[N(amount=10000, paid_at=datetime(2026, 11, 24, tzinfo=UTC), payment_method="cash", reference_number=None, status="Completed")])


def credit_sale():
    lines = [item("QA-Business cards", 1, 59000, discount=1000), item("QA-Exported service", 1, 20000, treatment="zero_rated"),
             item("QA-Training", 1, 10000, treatment="exempt")]
    o = order(items=lines, customer=N(name="QA-Green Hills Academy", address="KG 9 Ave", phone="+250788111222", email=None, tin="109876543"),
              payment_method="credit", status="Completed", payment_status="PartiallyPaid", is_overdue=True, due_date=date(2026, 11, 20),
              payments=[N(amount=30000, paid_at=datetime(2026, 11, 22, tzinfo=UTC), payment_method="bank", reference_number="TX-9", status="Completed"),
                        N(amount=5000, paid_at=datetime(2026, 11, 22, tzinfo=UTC), payment_method="cash", reference_number=None, status="Reversed")])
    o.amount_paid, o.outstanding_balance = 30000, o.total - 30000
    return o


def test_paid_walk_in_cash_sale():
    t = text(_build_pdf(paid_walk_in(), TENANT))
    assert "INVOICE" in t and "Invoice no." in t and "QA-ORD-0001" in t and "Walk-in customer" in t and "PAID" in t
    assert "Balance due" in t and "Prices include VAT." in t
    assert "Thank you for shopping with QA-Kigali Print House!" in t and t.count("Pesaa") == 1  # only "Powered by Pesaa"
    assert "Due date" not in t  # nothing is owed


def test_credit_sale_with_tin_discount_mixed_vat_and_part_payment():
    pdf = _build_pdf(credit_sale(), TENANT)
    t = text(pdf)
    assert "TIN 109876543" in t and "DISCOUNT" in t and "TAX" in t
    assert "Standard 18%" in t and "Zero-rated 0%" in t and "Exempt" in t
    assert "PARTIALLY PAID" in t and "OVERDUE" in t and "Due date" in t and "Balance due" in t
    assert "Received" in t and "Bank transfer" in t and "ref. TX-9" in t
    assert t.count("Received") == 1  # the reversed payment is not printed as money received
    assert "Please quote" in t and "Bank of Kigali" in t
    assert t.count("Pesaa") == 1


def test_cancelled_order_is_void_with_no_balance():
    o = paid_walk_in()
    o.status, o.payments = "Cancelled", []
    t = text(_build_pdf(o, TENANT))
    assert "VOID" in t and "INVOICE" in t and "Balance due" not in t and t.count("Pesaa") == 1


def test_foreign_currency_order_shows_base_and_rate():
    o = paid_walk_in()
    o.currency_code, o.exchange_rate, o.base_total = "USD", Decimal(1400), Decimal(14000000)
    t = text(_build_pdf(o, TENANT))
    assert "In RWF" in t and "Exchange rate" in t and t.count("Pesaa") == 1


def test_not_vat_registered_business_has_no_tax_column():
    lines = [item("QA-Soap", 3, 1000)]
    for line in lines:
        line.tax_treatment, line.tax_amount = "not_registered", 0.0
    t = text(_build_pdf(order(items=lines, tax=0), N(**{**TENANT.__dict__, "vat_enabled": False})))
    assert "TAX" not in t and "VAT" not in t and "Prices include VAT" not in t
