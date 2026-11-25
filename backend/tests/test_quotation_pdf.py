"""The A4 quotation PDF: the same document as the invoice (header, table, totals, closing), plus validity, terms and acceptance
lines; per-line VAT from each line's snapshot, never one rate everywhere; and only the data that exists.

Built from plain objects shaped like QuotationRead, uncompressed and in the built-in font so the text can be read in the bytes."""
import re
import uuid
from datetime import date
from types import SimpleNamespace as N

import pytest
from reportlab import rl_config

import app.main  # noqa: F401  (registers every model before the PDF module imports sales services)
from app.modules.sales.service.quotation_pdf import _build

TENANT = N(name="QA-Kigali Print House", logo_url=None, brand_color="#0F766E", currency="RWF", address="KN 4 Ave", city="Kigali", country="Rwanda",
           phone="+250788000000", email="hello@example.test", website="https://print.example.test", tin="100200300", vat_enabled=True,
           vat_number=None, vat_pricing_mode="inclusive", quotation_terms="Bank of Kigali · Account 000123456")


def line(name, qty, price, *, discount=0, treatment="standard", rate=18.0, sku=None, product_id=None, variant=None):
    gross = qty * price - discount
    tax = round(gross - gross / (1 + rate / 100), 2) if treatment == "standard" else 0.0
    return N(id=uuid.uuid4(), product_id=product_id, variant_id=None, product_name=name, sku=sku, variant_attributes=variant, unit_price=price,
             quantity=qty, discount=discount, line_total=gross, tax_treatment=treatment, tax_code=None, tax_rate=rate if treatment == "standard" else 0.0,
             taxable_base=round(gross - tax, 2), tax_amount=tax)


def quotation(items, **kw):
    subtotal = sum(i.line_total for i in items)
    base = {"quote_number": "QA-QUO-0001", "status": "Draft", "customer": None, "salesperson_name": "QA-Alice", "created_by": None,
            "issue_date": date(2026, 11, 24), "expiry_date": None, "subtotal": subtotal, "discount": 0, "tax": round(sum(i.tax_amount for i in items), 2),
            "total": subtotal, "notes": None, "terms": None, "converted_order_number": None, "items": items}
    base.update(kw)
    return N(**base)


def text(pdf: bytes) -> str:
    parts = re.findall(rb"\((.*?)\) Tj", pdf)
    parts += [b"".join(re.findall(rb"\((.*?)\)", chunk)) for chunk in re.findall(rb"\[(.*?)\] TJ", pdf)]
    return b" ".join(parts).decode("latin-1")


def pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type /Page\b", pdf))


@pytest.fixture(autouse=True)
def plain_pdf(monkeypatch):
    monkeypatch.setattr(rl_config, "pageCompression", 0)


PAPER, SERVICE = uuid.uuid4(), uuid.uuid4()


def sent_quotation():
    items = [line("QA-Business cards", 2, 30000, discount=1000, sku="QA-BC-01", product_id=PAPER, variant={"Finish": "Matte"}),
             line("QA-Exported design", 1, 20000, treatment="zero_rated", product_id=SERVICE), line("QA-Training", 1, 10000, treatment="exempt")]
    customer = N(name="QA-Green Hills Academy", address="KG 9 Ave", phone="+250788111222", email=None, tin="109876543")
    return quotation(items, status="Sent", customer=customer, expiry_date=date(2026, 12, 8), notes="QA-Delivery within 3 days of acceptance.",
                     terms="Payment: 50% on acceptance.\n\nBank of Kigali · Account 000123456")


def test_draft_walk_in_without_expiry():
    t = text(_build(quotation([line("QA-A4 paper ream", 2, 5000)]), TENANT, "QA-Alice", {}))
    assert "QUOTATION" in t and "Quotation no." in t and "QA-QUO-0001" in t and "DRAFT" in t
    assert "No customer selected" in t and "Prepared by" in t and "Prices include VAT." in t
    assert "valid until" not in t.lower()  # no expiry: no validity is invented
    assert "Balance due" not in t and "Print Date" not in t and "Amount paid" not in t
    assert "QTY UNIT PRICE" in t  # no line has a unit, so no Unit column between them
    assert "Thank you for shopping with QA-Kigali Print House!" in t and t.count("Pesaa") == 1
    assert "Bank of Kigali" in t  # no terms of its own: the business's standing terms


def test_sent_quotation_with_customer_expiry_discount_mixed_vat_units_notes_and_terms():
    pdf = _build(sent_quotation(), TENANT, "QA-Alice", {PAPER: "box", SERVICE: "hr"})
    t = text(pdf)
    assert "SENT" in t and "QA-Green Hills Academy" in t and "TIN 109876543" in t
    assert "Valid until" in t and "This quotation is valid until" in t and "08 Dec 2026" in t
    assert "DISCOUNT" in t and "QTY UNIT UNIT PRICE" in t and "box" in t and "hr" in t and "QA-BC-01" in t and "Finish: Matte" in t
    # the Tax column comes from each line's own snapshot, not one rate on every line
    assert "18%" in t and "0%" in t and "Exempt" in t and "18.00" not in t
    assert "Standard 18%" in t and "Zero-rated 0%" in t  # VAT summary
    assert "QA-Delivery within 3 days" in t and "TERMS" in t and "Payment: 50% on acceptance." in t
    assert t.count("Bank of Kigali") == 1  # its own terms replace the standing terms, never both
    assert "ACCEPTED BY CUSTOMER" in t and "FOR QA-KIGALI PRINT HOUSE" in t
    assert "Balance due" not in t and "Print Date" not in t and "Authorized Signature" not in t


def test_accepted_and_converted_quotation():
    t = text(_build(quotation([line("QA-Banner", 1, 45000)], status="Accepted", converted_order_number="INV-0042"), TENANT, None, {}))
    assert "ACCEPTED" in t and "Converted to" in t and "INV-0042" in t
    assert "Prepared by" not in t  # nobody recorded: no empty row


def test_long_quotation_flows_over_pages_with_the_header_repeated():
    items = [line(f"QA-Item {n}", 1, 1000 + n) for n in range(40)]
    pdf = _build(quotation(items), TENANT, "QA-Alice", {})
    t = text(pdf)
    assert pages(pdf) >= 2
    assert t.count("DESCRIPTION") >= 2  # the table header repeats on the next page
    assert "QA-Item 39" in t and t.count("ACCEPTED BY CUSTOMER") == 1  # totals and signatures once, at the end


def test_not_vat_registered_business_has_no_tax_column():
    items = [line("QA-Soap", 3, 1000)]
    for i in items:
        i.tax_treatment, i.tax_amount = "not_registered", 0.0
    t = text(_build(quotation(items, tax=0), N(**{**TENANT.__dict__, "vat_enabled": False}), "QA-Alice", {}))
    assert "TAX" not in t and "VAT" not in t
