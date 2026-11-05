"""Quotations: lifecycle, PDF, and one-time conversion into a Pending sale that moves no money and no stock."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.main import app
from app.modules.inventory.models.product import Product
from tests.test_sales_team import API, team


def body(product, **extra):
    return {"items": [{"product_id": str(product), "product_name": "Widget", "unit_price": 100, "quantity": 3}], "notes": "Delivery in 5 days", **extra}


async def widget(db, tenant):
    from sqlalchemy import select
    return (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()


@pytest.mark.db
async def test_quotation_lifecycle_pdf_and_conversion_without_money_or_stock_effects(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = await widget(db, tenant)
    try:
        async with client(ann) as c:
            made = await c.post(f"{API}/sales/quotations", json=body(product.id, discount=20))
            assert made.status_code == 201, made.text
            q = made.json()["data"]
            assert q["quote_number"] == "QUO-0001" and q["status"] == "Draft" and q["subtotal"] == 300 and q["total"] == 280 and q["salesperson_name"] == "Ann"
            edited = await c.patch(f"{API}/sales/quotations/{q['id']}", json={"discount": 0, "items": [{"product_id": str(product.id), "product_name": "Widget", "unit_price": 100, "quantity": 5}]})
            assert edited.json()["data"]["total"] == 500
            assert (await c.post(f"{API}/sales/quotations/{q['id']}/accept")).status_code == 409  # must be sent first
            assert (await c.post(f"{API}/sales/quotations/{q['id']}/convert")).status_code == 409
            assert (await c.post(f"{API}/sales/quotations/{q['id']}/send")).json()["data"]["status"] == "Sent"
            assert (await c.patch(f"{API}/sales/quotations/{q['id']}", json={"notes": "late change"})).status_code == 409  # a sent offer is frozen
            pdf = await c.get(f"{API}/sales/quotations/{q['id']}/quotation.pdf")
            assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
            assert (await c.post(f"{API}/sales/quotations/{q['id']}/accept")).json()["data"]["status"] == "Accepted"
            first = await c.post(f"{API}/sales/quotations/{q['id']}/convert")
            again = await c.post(f"{API}/sales/quotations/{q['id']}/convert")
            assert first.status_code == 201 and again.status_code == 200
            assert first.json()["data"]["converted_order_id"] == again.json()["data"]["converted_order_id"]
            order = (await c.get(f"{API}/sales/orders/{first.json()['data']['converted_order_id']}")).json()["data"]
            assert order["status"] == "Pending" and order["amount_paid"] == 0 and order["salesperson_id"] == str(ann.id) and "QUO-0001" in order["notes"]
            assert float((await db.get(Product, product.id, populate_existing=True)).stock) == 100
            orders = (await c.get(f"{API}/sales/orders")).json()["data"]["items"]
            assert len(orders) == 1  # the retry created no second sale
            kinds = [a["action"] for a in (await c.get(f"{API}/sales/quotations/{q['id']}/activity")).json()["data"]]
            assert {"quotation.create", "quotation.sent", "quotation.accepted", "quotation.convert"} <= set(kinds)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_rejection_expiry_and_validation(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = await widget(db, tenant)
    today = datetime.now(UTC).date()
    try:
        async with client(ann) as c:
            assert (await c.post(f"{API}/sales/quotations", json=body(product.id, issue_date=str(today), expiry_date=str(today - timedelta(days=1))))).status_code == 422
            assert (await c.post(f"{API}/sales/quotations", json={"items": []})).status_code == 422
            soon = (await c.post(f"{API}/sales/quotations", json=body(product.id, issue_date=str(today - timedelta(days=10)), expiry_date=str(today - timedelta(days=2))))).json()["data"]
            await c.post(f"{API}/sales/quotations/{soon['id']}/send")
            expired = (await c.get(f"{API}/sales/quotations/{soon['id']}")).json()["data"]
            assert expired["status"] == "Expired"
            assert (await c.post(f"{API}/sales/quotations/{soon['id']}/accept")).status_code == 409
            other = (await c.post(f"{API}/sales/quotations", json=body(product.id))).json()["data"]
            await c.post(f"{API}/sales/quotations/{other['id']}/send")
            assert (await c.post(f"{API}/sales/quotations/{other['id']}/reject", json={"reason": "x"})).status_code == 422
            rejected = (await c.post(f"{API}/sales/quotations/{other['id']}/reject", json={"reason": "Found it cheaper"})).json()["data"]
            assert rejected["status"] == "Rejected" and rejected["decision_reason"] == "Found it cheaper"
            assert (await c.post(f"{API}/sales/quotations/{other['id']}/convert")).status_code == 409
            assert len((await c.get(f"{API}/sales/quotations", params={"status": "Rejected"})).json()["data"]["items"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_quotations_are_private_to_the_tenant_and_to_the_salesperson_when_that_policy_is_on(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = await widget(db, tenant)
    try:
        async with client(ann) as c:
            mine = (await c.post(f"{API}/sales/quotations", json=body(product.id))).json()["data"]
        tenant.approval_rules = {"own_sales_only": True}
        await db.flush()
        async with client(ben) as c:
            assert (await c.get(f"{API}/sales/quotations/{mine['id']}")).status_code == 403
            assert (await c.get(f"{API}/sales/quotations")).json()["data"]["items"] == []
        async with client(owner) as c:
            assert len((await c.get(f"{API}/sales/quotations")).json()["data"]["items"]) == 1
            assert (await c.get(f"{API}/sales/quotations/{uuid.uuid4()}")).status_code == 404
    finally:
        app.dependency_overrides.clear()
