"""Pictures pasted into an Excel product sheet: attached to the right product by row, main picture plus extras, safe to repeat."""
import io
import re
import zipfile

import pytest
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XlImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, TwoCellAnchor
from PIL import Image as PilImage
from sqlalchemy import func, select

from app.main import app
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.product_image import ProductImage
from tests.test_sales_team import API, team

URL = f"{API}/inventory/products/import-pictures"


def png_bytes(color: str, size=(40, 30)) -> bytes:
    buf = io.BytesIO()
    PilImage.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def sheet(rows, pictures, two_cell=None):
    """An .xlsx with the given rows (header first) and pictures [(cell, colour)] pasted over cells."""
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    for cell, color in pictures:
        img = XlImage(io.BytesIO(png_bytes(color)))
        img.width, img.height = 40, 20
        ws.add_image(img, cell)
    if two_cell:  # a tall picture that starts in one row and ends in the next
        (c1, r1, c2, r2, color) = two_cell
        img = XlImage(io.BytesIO(png_bytes(color)))
        img.anchor = TwoCellAnchor(editAs="twoCell", _from=AnchorMarker(col=c1, row=r1, colOff=0, rowOff=0), to=AnchorMarker(col=c2, row=r2, colOff=0, rowOff=0))
        ws.add_image(img)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


async def make_products(db, tenant, *specs):
    items = []
    for name, sku, barcode in specs:
        p = Product(tenant_id=tenant.id, name=name, sku=sku, barcode=barcode, price=10, cost=5, stock=1)
        db.add(p)
        items.append(p)
    await db.flush()
    return items


async def upload(c, data, name="products.xlsx"):
    return await c.post(URL, files={"file": (name, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})


@pytest.mark.db
async def test_pictures_pasted_in_rows_attach_by_sku_with_a_main_picture_and_extras(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    a, b, c3 = await make_products(db, tenant, ("Iron Oxide Blue", "PN0333", None), ("Iron Oxide Red", "PN0315", None), ("Green", None, "5900000000001"))
    rows = [["name", "sku", "barcode", "price", "Photo"], ["Iron Oxide Blue", "PN0333", "", 1, ""], ["Iron Oxide Red", "PN0315", "", 2, ""], [], ["Green", "", "5900000000001", 3, ""], ["Nobody", "ZZ999", "", 4, ""]]
    # row 2: one picture; row 3: two pictures (main left, extra right); row 5: matched by barcode; row 6: no such product; row 1: a logo on the header
    pictures = [("E2", "red"), ("E3", "green"), ("G3", "blue"), ("E5", "yellow"), ("E6", "black"), ("H1", "white")]
    try:
        async with client(owner) as c:
            r = await upload(c, sheet(rows, pictures))
            assert r.status_code == 200, r.text
            data = r.json()["data"]
            assert data["source"] == "excel" and data["matched"] == 3 and data["total_pictures"] == 4 and data["extra_pictures"] == 1
            assert any(p["file"] == "Row 6" and "No product" in p["reason"] for p in data["problems"])
            assert not any(p["file"] == "Row 1" for p in data["problems"] + data["pictures"])
            for p in (a, b, c3):
                await db.refresh(p)
                assert p.image_url and p.image_url.startswith("/uploads/")
            extras = (await db.execute(select(func.count()).select_from(ProductImage).where(ProductImage.product_id == b.id))).scalar_one()
            assert extras == 1 and (await db.execute(select(func.count()).select_from(ProductImage).where(ProductImage.product_id == a.id))).scalar_one() == 0
            # the same file again changes nothing about the extras
            again = (await upload(c, sheet(rows, pictures))).json()["data"]
            assert again["extra_pictures"] == 0
            assert (await db.execute(select(func.count()).select_from(ProductImage).where(ProductImage.product_id == b.id))).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_tall_picture_belongs_to_the_row_under_its_middle_and_names_match_when_there_is_no_sku(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    first, second = await make_products(db, tenant, ("Bag A", None, None), ("Bag B", None, None))
    rows = [["Name", "Price"], ["Bag A", 1], ["Bag B", 2]]
    try:
        async with client(owner) as c:
            # starts a little into row 2 and ends well into row 3: its middle is in row 3 (Bag B)
            data = (await upload(c, sheet(rows, [], two_cell=(3, 1, 4, 3, "orange")))).json()["data"]
            assert data["matched"] == 1 and data["pictures"][0]["file"] == "Row 3" and data["pictures"][0]["product"] == "Bag B"
            await db.refresh(second)
            await db.refresh(first)
            assert second.image_url.startswith("/uploads/") and not (first.image_url or "").startswith("/uploads/")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_unreadable_pictures_and_odd_files_are_reported_not_crashed(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    await make_products(db, tenant, ("Item", "S1", None))
    rows = [["name", "sku"], ["Item", "S1"]]
    try:
        async with client(owner) as c:
            assert (await c.post(URL, files={"file": ("x.xlsx", b"nope", "application/octet-stream")})).status_code == 422
            empty = await upload(c, sheet(rows, []))
            assert empty.status_code == 422 and "No pictures" in empty.json()["message"]
            no_headings = await upload(c, sheet([[None], ["x"]], [("A2", "red")]))
            assert no_headings.status_code == 422
            # a picture whose bytes are not an image (like an EMF) is listed with the reason
            good = sheet(rows, [("C2", "red")])
            broken = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(good)) as src, zipfile.ZipFile(broken, "w") as dst:
                for item in src.infolist():
                    data = src.read(item.filename)
                    dst.writestr(item.filename, b"\x01\x00\x00\x00 not a picture" if item.filename.startswith("xl/media/") else data)
            report = await upload(c, broken.getvalue())
            assert report.status_code == 200, report.text
            data = report.json()["data"]
            assert data["matched"] == 0 and data["problems"] and "not supported" in data["problems"][0]["reason"]
    finally:
        app.dependency_overrides.clear()


def _with_parts(base: bytes, patch_sheet, parts: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(base)) as src, zipfile.ZipFile(out, "w") as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                data = patch_sheet(data.decode()).encode()
            dst.writestr(item.filename, data)
        for name, data in parts.items():
            dst.writestr(name, data)
    return out.getvalue()


@pytest.mark.db
async def test_pictures_placed_inside_cells_by_wps_and_excel_365_are_read_too(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    wps, e365 = await make_products(db, tenant, ("WPS item", "W1", None), ("Excel365 item", "E1", None))
    rows = [["name", "sku", "photo"], ["WPS item", "W1", '=_xlfn.DISPIMG("ID_ABC",1)'], ["Excel365 item", "E1", "x"]]
    ns = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    cellimages = (f'<etc:cellImages xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
                  f'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" {ns}><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="ID_ABC"/></xdr:nvPicPr>'
                  '<xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>')
    rel = lambda target: ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="' + target + '"/></Relationships>')  # noqa: E731
    parts = {
        "xl/cellimages.xml": cellimages.encode(), "xl/_rels/cellimages.xml.rels": rel("media/wps1.png").encode(), "xl/media/wps1.png": png_bytes("red"),
        "xl/metadata.xml": (b'<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata">'
                            b'<futureMetadata name="XLRICHVALUE" count="1"><bk><extLst><ext uri="{3e2802c4}"><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata>'
                            b'<valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>'),
        "xl/richData/rdrichvaluestructure.xml": b'<rvStructures xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>',
        "xl/richData/rdrichvalue.xml": b'<rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><rv s="0"><v>0</v><v>5</v></rv></rvData>',
        "xl/richData/richValueRel.xml": f'<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" {ns}><rel r:id="rId1"/></richValueRels>'.encode(),
        "xl/richData/_rels/richValueRel.xml.rels": rel("../media/image9.png").encode(), "xl/media/image9.png": png_bytes("blue"),
    }
    book = _with_parts(sheet(rows, []), lambda xml: re.sub(r'<c r="C3"', '<c r="C3" vm="1"', xml), parts)
    try:
        async with client(owner) as c:
            data = (await upload(c, book)).json()["data"]
            assert data["matched"] == 2, data
            await db.refresh(wps)
            await db.refresh(e365)
            assert wps.image_url.startswith("/uploads/") and e365.image_url.startswith("/uploads/")
    finally:
        app.dependency_overrides.clear()
