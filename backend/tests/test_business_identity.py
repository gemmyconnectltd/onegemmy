"""The business's email and TIN are printed in the header of every invoice and accounting document."""
from types import SimpleNamespace

from app.modules.accounting.service.export import _tenant_contact_lines as accounting_lines
from app.modules.sales.service.invoice_pdf import _tenant_contact_lines as invoice_lines
from app.modules.tenants.schemas import TenantUpdate


def business(**extra):
    base = dict(address="KG 7 Ave", city="Kigali", country="Rwanda", phone="+250788000000", website=None, email=None, tin=None)
    return SimpleNamespace(**{**base, **extra})


def test_email_and_tin_appear_on_invoice_and_accounting_headers():
    for lines in (invoice_lines, accounting_lines):
        out = lines(business(email="info@shop.rw", tin="123456789"))
        assert "Email: info@shop.rw" in out and "TIN: 123456789" in out


def test_missing_email_and_tin_leave_no_blank_lines():
    for lines in (invoice_lines, accounting_lines):
        assert not any("Email" in line or "TIN" in line for line in lines(business()))


def test_update_accepts_email_and_tin_and_rejects_a_bad_email():
    data = TenantUpdate(email="info@shop.rw", tin="123456789")
    assert data.model_dump(exclude_unset=True) == {"email": "info@shop.rw", "tin": "123456789"}
    try:
        TenantUpdate(email="not-an-email")
    except ValueError:
        return
    raise AssertionError("a malformed email must be refused")
