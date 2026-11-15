"""Import engine: AI-read rows are transcribed, never computed or invented, and staged rows are checked against the
business's own records (duplicates, category/brand/unit names) without writing anything."""
import uuid

import pytest

import app.main  # noqa: F401
from app.modules.imports import service

FIELDS = [{"key": "name", "label": "Name"}, {"key": "cost", "label": "Cost"}, {"key": "stock", "label": "Stock"}]


def test_extraction_keeps_only_known_fields_as_written_and_flags_uncertain_values():
    reply = {"rows": [
        {"name": "Soap", "cost": "2,500", "stock": None, "made_up": "x"},
        {"name": "", "cost": "", "stock": ""},  # an empty line is dropped, not filled
        {"name": "Oil", "cost": 1200, "stock": "4"},
    ], "uncertain": [{"row": 1, "field": "cost"}, {"row": 9, "field": "cost"}, {"row": 0, "field": "nope"}], "note": "Stock sheet"}
    out = service.shape_extraction(reply, FIELDS)
    assert out["headers"] == ["Name", "Cost", "Stock"]
    assert out["rows"] == [["Soap", "2,500", ""], ["Oil", "1200", "4"]]  # blanks stay blank, separators kept for review
    assert out["uncertain"] == [[1, 1]]  # out-of-range rows and unknown fields are ignored
    assert out["note"] == "Stock sheet"


@pytest.mark.parametrize("reply", ['```json\n{"rows": []}\n```', 'Here you go: {"rows": []} thanks'])
def test_json_reply_is_found_with_or_without_a_fence(reply):
    assert service.parse_json_reply(reply) == {"rows": []}


def test_unreadable_reply_is_refused():
    with pytest.raises(ValueError):
        service.parse_json_reply("I can't read this picture")


@pytest.mark.parametrize("a,b", [("+250 788 123 456", "0788123456"), ("788-123-456", "(+250)788123456")])
def test_phone_numbers_compare_by_their_last_nine_digits(a, b):
    assert service.phone_key(a) == service.phone_key(b) != ""


def test_photos_are_refused_honestly_when_ai_is_not_connected(monkeypatch):
    monkeypatch.setattr(service.settings, "AI_PROVIDER", "mock")
    caps = service.ai_capabilities()
    assert caps == {**caps, "available": False, "photos": False, "pdf": False}
    assert "Excel and CSV" in caps["reason"]


@pytest.mark.db
async def test_product_rows_are_checked_against_this_business_only(db):
    from app.modules.inventory.models.category import Category
    from app.modules.inventory.models.product import Product
    from app.modules.tenants.models import Tenant

    mine, other = (Tenant(name=f"Import {n} {uuid.uuid4().hex[:6]}", slug=f"imp-{uuid.uuid4().hex[:10]}") for n in "AB")
    db.add_all([mine, other])
    await db.flush()
    drinks = Category(tenant_id=mine.id, name="Drinks")
    db.add_all([drinks, Product(tenant_id=mine.id, name="Fanta 500ml", sku="FAN-500", barcode="600100"),
                Product(tenant_id=other.id, name="Sprite", sku="SPR-1")])
    await db.flush()
    rows = [
        {"name": "Fanta", "sku": "fan-500"},                       # SKU already used (case does not matter)
        {"name": "Fanta big", "barcode": "600100"},                # barcode already used
        {"name": "fanta 500ML", "sku": "NEW-1"},                   # same name: allowed, with a warning
        {"name": "Sprite", "sku": "SPR-1", "category": "drinks"},  # another business's SKU is not a duplicate
        {"name": "Juice", "category": "Juices"},                   # unknown category: warning, never created silently
    ]
    out = await service.check(db, mine.id, "products", rows)
    assert out[0]["duplicate"].startswith("SKU 'fan-500' is already used by Fanta 500ml")
    assert out[1]["duplicate"].startswith("Barcode '600100'")
    assert out[2]["duplicate"] is None and out[2]["issues"][0]["level"] == "warning"
    assert out[3]["duplicate"] is None and out[3]["context"] == {"_category_id": str(drinks.id)}
    assert out[4]["context"] == {} and out[4]["issues"][0]["column"] == "category"


def _sheet_with_pictures() -> bytes:
    """An .xlsx with a heading row and pictures pasted over rows 2 and 3, made the way Excel stores floating pictures."""
    import io

    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XlImage
    from PIL import Image

    wb = Workbook()
    ws = wb.active
    ws.append(["name", "sku"])
    ws.append(["Soap (renamed in review)", "S-1"])
    ws.append(["Oil", "O-1"])
    for cell, colour in (("C2", "red"), ("C3", "blue")):
        buf = io.BytesIO()
        Image.new("RGB", (16, 16), colour).save(buf, "PNG")  # fits inside one default-height row
        buf.seek(0)
        ws.add_image(XlImage(buf), cell)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def test_sheet_picture_previews_are_listed_by_sheet_row():
    rows = service.sheet_picture_previews(_sheet_with_pictures())["rows"]
    assert sorted(rows) == ["2", "3"]
    assert rows["2"][0]["preview"].startswith("data:image/jpeg;base64,") and rows["2"][0]["problem"] is None


@pytest.mark.db
async def test_sheet_pictures_attach_to_the_product_created_from_their_row(db, monkeypatch):
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.service import product_image_import as pictures
    from app.modules.tenants.models import Tenant

    saved: list[str] = []

    async def save(folder, name, data):
        saved.append(name)
        return f"/uploads/{folder}/{name}"
    monkeypatch.setattr(pictures.storage, "save", save)
    tenant = Tenant(name=f"Pics {uuid.uuid4().hex[:6]}", slug=f"pics-{uuid.uuid4().hex[:10]}")
    db.add(tenant)
    await db.flush()
    soap = Product(tenant_id=tenant.id, name="Soap", sku="S-1")  # the sheet says another name: matching is by row, not by name
    oil = Product(tenant_id=tenant.id, name="Oil", sku="O-1")
    db.add_all([soap, oil])
    await db.flush()
    # Row 3's picture was removed during review, so only row 2 is sent.
    result = await pictures.attach_sheet_pictures(db, tenant.id, _sheet_with_pictures(), {2: soap.id})
    assert result["total_pictures"] == 1 and result["problems"] == []
    assert soap.image_url == "/uploads/products/S-1-row2.jpg" and oil.image_url is None
    assert saved == ["S-1-row2.jpg"]
