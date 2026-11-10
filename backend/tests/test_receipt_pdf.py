"""The till receipt PDF: thermal-paper width, the sale's own figures, and the business's identity."""
import re
from datetime import UTC, datetime
from types import SimpleNamespace as N

import pytest

import app.main  # noqa: F401  (registers every model before the PDF module imports sales services)
from app.modules.sales.service.receipt_pdf import build_receipt


def _sale():
    items = [N(product_name="Soda 500ml", variant_attributes=None, quantity=3, unit_price=800, discount=0, line_total=2400)]
    return N(order_number="SO-00123", ordered_at=datetime(2026, 11, 10, 9, 30, tzinfo=UTC), customer=N(name="Jean", tin="102345678"), items=items,
             subtotal=2400, original_subtotal=2400, discount=0, total_discount=0, discount_details=[], tax=0, total=2400,
             currency_code="RWF", payments=[], payment_method="cash", amount_tendered=3000, amount_paid=2400,
             outstanding_balance=0, change_due=600, due_date=None)


TENANT = N(name="Kigali Fresh Mart", logo_url=None, currency="RWF", address="KN 4 Ave", city=None, country=None,
           phone="+250788000000", email=None, website=None, tin="100200300", vat_enabled=False)


@pytest.mark.parametrize(("paper", "points"), [("80mm", 226.77), ("58mm", 164.41), ("A4", 595.28)])
def test_receipt_is_thermal_width(paper, points):
    pdf = build_receipt(_sale(), TENANT, paper, "Alice")
    width = float(re.search(rb"/MediaBox \[\s*0 0 ([\d.]+)", pdf).group(1))
    assert abs(width - points) < 0.5
    assert b"/Count 1" in pdf  # one continuous slip, as long as the receipt
