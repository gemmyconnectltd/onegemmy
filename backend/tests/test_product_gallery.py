"""Product gallery: extra pictures beside the main one, with a swap-to-main, a limit and tenant isolation."""
import base64

import pytest
from sqlalchemy import select

from app.main import app
from app.modules.inventory.models.product import Product
from tests.test_sales_team import API, team

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
BASE = f"{API}/inventory/products"


def png(name="a.png"):
    return {"file": (name, PNG, "image/png")}


@pytest.mark.db
async def test_gallery_add_promote_remove_and_limits(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()
    try:
        async with client(owner) as c:
            assert (await c.get(f"{BASE}/{product.id}/images")).json()["data"]["gallery"] == []
            bad = await c.post(f"{BASE}/{product.id}/images", files={"file": ("x.txt", b"hello", "text/plain")})
            assert bad.status_code == 422
            first = (await c.post(f"{BASE}/{product.id}/images", files=png("one.png"))).json()["data"]
            second = (await c.post(f"{BASE}/{product.id}/images", files=png("two.png"))).json()["data"]
            assert len(second["gallery"]) == 2
            # main picture: upload one, then promote a gallery picture and the old main takes its place
            assert (await c.post(f"{BASE}/{product.id}/image", files=png("main.png"))).status_code == 200
            before = (await c.get(f"{BASE}/{product.id}/images")).json()["data"]
            chosen = before["gallery"][0]
            swapped = (await c.post(f"{BASE}/{product.id}/images/{chosen['id']}/make-main")).json()["data"]
            assert swapped["main"] == chosen["url"]
            assert before["main"] in [g["url"] for g in swapped["gallery"]] and len(swapped["gallery"]) == 2
            gone = (await c.delete(f"{BASE}/{product.id}/images/{swapped['gallery'][0]['id']}")).json()["data"]
            assert len(gone["gallery"]) == 1
            assert first["gallery"][0]["url"]
            for n in range(7):
                await c.post(f"{BASE}/{product.id}/images", files=png(f"n{n}.png"))
            full = await c.post(f"{BASE}/{product.id}/images", files=png("over.png"))
            assert full.status_code == 409
        other = await team(db, monkeypatch)
        async with other[4](other[3]) as c:
            assert (await c.get(f"{BASE}/{product.id}/images")).status_code == 404
            assert (await c.post(f"{BASE}/{product.id}/images", files=png())).status_code == 404
    finally:
        app.dependency_overrides.clear()


def _zip(files: dict[str, bytes]) -> bytes:
    import io
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


@pytest.mark.db
async def test_pictures_zip_attaches_by_sku_or_barcode_and_reports_the_rest(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()
    product.sku, product.barcode = "PN0333", "6001234567890"
    other = Product(tenant_id=tenant.id, name="Second", sku="PN0400", price=1, cost=1, stock=1)
    db.add(other)
    await db.flush()
    url = f"{BASE}/import-pictures"
    try:
        async with client(owner) as c:
            zipped = _zip({"pn0333.png": PNG, "folder/PN0400.png": PNG, "NOBODY.png": PNG, "fake.png": b"not an image at all", "notes.txt": b"hi", "__MACOSX/._PN0333.png": b"x"})
            r = await c.post(url, files={"file": ("pictures.zip", zipped, "application/zip")})
            assert r.status_code == 200, r.text
            data = r.json()["data"]
            assert data["matched"] == 2 and data["skipped"] == 3
            reasons = {p["file"]: p["reason"] for p in data["problems"]}
            assert "No product" in reasons["NOBODY.png"] and "not really" in reasons["fake.png"] and "Not a JPEG" in reasons["notes.txt"]
            await db.refresh(product)
            assert product.image_url and product.image_url.startswith("/uploads/")
            by_barcode = await c.post(url, files={"file": ("p.zip", _zip({"6001234567890.png": PNG}), "application/zip")})
            assert by_barcode.json()["data"]["matched"] == 1
            assert (await c.post(url, files={"file": ("bad.zip", b"definitely not a zip", "application/zip")})).status_code == 422
            many = _zip({f"f{n}.png": PNG for n in range(301)})
            assert (await c.post(url, files={"file": ("many.zip", many, "application/zip")})).status_code == 422
        async with client(ann) as c:  # a till user cannot bulk-attach pictures
            assert (await c.post(url, files={"file": ("p.zip", _zip({"PN0333.png": PNG}), "application/zip")})).status_code == 403
        other_team = await team(db, monkeypatch)
        async with other_team[4](other_team[3]) as c:  # another business's pictures never reach this product
            r = await c.post(url, files={"file": ("p.zip", _zip({"PN0333.png": PNG}), "application/zip")})
            assert r.json()["data"]["matched"] == 0
    finally:
        app.dependency_overrides.clear()


def test_bulk_import_rows_only_accept_web_links_for_pictures():
    from pydantic import ValidationError

    from app.modules.inventory.schemas.product import ProductBulkLine
    base = {"name": "X", "price": 1, "cost": 1, "stock": 1}
    assert ProductBulkLine(**base, image_url=" https://cdn.example.com/a.jpg ").image_url == "https://cdn.example.com/a.jpg"
    assert ProductBulkLine(**base, image_url="").image_url is None
    for bad in ("javascript:alert(1)", "data:image/png;base64,AAAA", "http://insecure.example.com/a.jpg", "C:\\pics\\a.jpg", "//evil.example.com/a.jpg"):
        with pytest.raises(ValidationError):
            ProductBulkLine(**base, image_url=bad)
