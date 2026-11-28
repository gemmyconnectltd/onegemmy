"""One sale, one number, and every document titled after it: INV-/ORD- is an INVOICE, a sale saved before it is completed
is a SALES ORDER with its own SO- series and becomes the next INV- number when completed ("Order ref. SO-…"); the till receipt
is "Receipt for invoice INV-…". Old numbers are never renumbered."""
from types import SimpleNamespace as N

import pytest
from reportlab import rl_config

from app.modules.sales.models.order import Order
from app.modules.sales.schemas import OrderCreate, OrderItemCreate, OrderUpdate
from app.modules.sales.service import order as order_service
from app.modules.sales.service.document_words import file_name, receipt_for, sale_document
from app.modules.sales.service.invoice_pdf import _build_pdf
from app.modules.sales.service.receipt_pdf import build_receipt
from tests.test_credit_limit import customer, make_tenant, sell
from tests.test_invoice_pdf import TENANT, item, order, text


def test_titles_follow_the_number():
    assert sale_document("INV-0017") == ("Invoice", "Invoice date")
    assert sale_document("ORD-0097") == ("Order", "Order date")  # POS sales (and older sales) are orders
    assert sale_document("SO-0012") == ("Sales order", "Order date")
    assert receipt_for("INV-0017") == "Receipt for invoice INV-0017"
    assert file_name("Invoice", "INV-0017") == "Invoice INV-0017.pdf"
    assert file_name("Receipt", "INV-0017") == "Receipt INV-0017.pdf"
    assert receipt_for("ORD-0097") == "Receipt for order ORD-0097"


@pytest.fixture
def plain_pdf(monkeypatch):
    monkeypatch.setattr(rl_config, "pageCompression", 0)


def test_invoice_pdf_words(plain_pdf):
    o = order(items=[item("Paper", 1, 1000)], order_number="INV-0017", sales_order_number="SO-0012", quotation_number="QUO-0005")
    t = text(_build_pdf(o, TENANT))
    assert "INVOICE" in t and "Invoice no." in t and "INV-0017" in t and "Invoice date" in t
    assert "Order ref." in t and "SO-0012" in t and "Quotation ref." in t and "QUO-0005" in t
    assert "Issue date" not in t and "SALES ORDER" not in t

    pos = text(_build_pdf(order(items=[item("Paper", 1, 1000)], order_number="ORD-0097"), TENANT))
    assert "ORDER" in pos and "Order no." in pos and "ORD-0097" in pos and "Order date" in pos and "INVOICE" not in pos

    so = text(_build_pdf(order(items=[item("Paper", 1, 1000)], order_number="SO-0012", status="Pending"), TENANT))
    assert "SALES ORDER" in so and "Sales order no." in so and "Order date" in so and "INVOICE" not in so


def test_receipt_words(plain_pdf):
    from tests.test_receipt_pdf import TENANT as SHOP
    from tests.test_receipt_pdf import _sale

    t = text(build_receipt(N(**{**_sale().__dict__, "order_number": "INV-0017"}), SHOP, "80mm", "Alice"))
    assert "RECEIPT" in t and "Receipt for invoice INV-0017" in t


@pytest.mark.db
async def test_completed_sale_is_an_invoice_and_an_open_sale_a_sales_order_until_completed(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    db.add(Order(tenant_id=t.id, order_number="ORD-0030", status="Completed", subtotal=0, total=0))  # an old number
    await db.flush()

    paid = await sell(db, t, u, p, c, 1000, paid=1000)
    assert paid.order_number == "INV-0031" and paid.sales_order_number is None  # the invoice counter carries on from ORD-

    pending = await order_service.create_order(db, t.id, u.id, OrderCreate(
        status="Pending", customer_id=c.id, amount_tendered=1000,
        items=[OrderItemCreate(product_id=p.id, product_name=p.name, unit_price=1000, quantity=1)]))
    assert pending.order_number == "SO-0001"
    assert (await sell(db, t, u, p, c, 1000, paid=1000)).order_number == "INV-0032"  # SO- numbers don't move the invoice series

    done = await order_service.update_order(db, t.id, pending.id, OrderUpdate(status="Completed"))
    assert done.status == "Completed" and done.order_number == "INV-0033" and done.sales_order_number == "SO-0001"


@pytest.mark.db
async def test_a_held_sale_is_a_sales_order_until_approved(db):
    from app.modules.tenants.models import User

    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    await sell(db, t, u, p, c, 400000)
    held = await sell(db, t, u, p, c, 300000, paid=50000)
    assert held.status == "Awaiting Approval" and held.order_number == "SO-0001"
    boss = User(email="boss-docs@test.local", hashed_password="x", full_name="CEO", tenant_id=t.id, role="owner")
    db.add(boss)
    await db.flush()
    done = await order_service.approve_order(db, t.id, held.id, boss.id, "CEO")
    assert done.order_number == "INV-0002" and done.sales_order_number == "SO-0001"


@pytest.mark.db
async def test_a_pos_sale_is_an_order_on_the_invoice_counter(db):
    t, u, p = await make_tenant(db)
    c = await customer(db, t)
    invoice = await sell(db, t, u, p, c, 1000, paid=1000)
    till = await order_service.create_order(db, t.id, u.id, OrderCreate(
        status="Completed", customer_id=c.id, amount_paid=1000, payment_method="cash", pricing_channel="pos",
        items=[OrderItemCreate(product_id=p.id, product_name=p.name, unit_price=1000, quantity=1)]))
    after = await sell(db, t, u, p, c, 1000, paid=1000)
    assert (invoice.order_number, till.order_number, after.order_number) == ("INV-0001", "ORD-0002", "INV-0003")
