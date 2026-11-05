"""Bulk pictures for products: a ZIP of image files named after the product's SKU or barcode (PN0333.jpg, 6001234567890.png).

Nothing is fetched from the internet (no server-side download of customer-supplied links). The archive is read in memory with hard limits
so a hostile ZIP cannot exhaust the server, and every file must really be a JPEG, PNG or WebP by its first bytes, not just by its name.
"""
import io
import uuid
import zipfile
from pathlib import PurePosixPath

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.integrations.storage import storage
from app.modules.inventory.models.product import Product
from app.modules.inventory.service import xlsx_pictures
from app.modules.inventory.service.product import _is_uploaded_file
from app.modules.inventory.service.product_gallery import attach_extra
from app.modules.tenants.models import User

MAX_ZIP_BYTES = 60 * 1024 * 1024
MAX_FILES = 300
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_UNPACKED_BYTES = 120 * 1024 * 1024
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _looks_like_image(data: bytes) -> bool:
    return data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")


async def import_pictures(db: AsyncSession, tenant_id: uuid.UUID, content: bytes, actor: User | None = None) -> dict:
    """Either a ZIP of pictures named by SKU/barcode, or an Excel workbook with the pictures pasted into its rows."""
    if len(content) > MAX_ZIP_BYTES:
        raise ValidationError("The file is too large. Keep it under 60MB, or split it in two.")
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise ValidationError("That is not a ZIP or Excel (.xlsx) file.") from exc
    if xlsx_pictures.is_workbook(archive):
        return await import_workbook_pictures(db, tenant_id, content)
    entries = [i for i in archive.infolist() if not i.is_dir() and not PurePosixPath(i.filename).name.startswith(("._", ".")) and "__MACOSX" not in i.filename]
    if len(entries) > MAX_FILES:
        raise ValidationError(f"The ZIP has {len(entries)} files. Send at most {MAX_FILES} at a time.")
    if sum(i.file_size for i in entries) > MAX_UNPACKED_BYTES:
        raise ValidationError("The pictures are too large once unpacked. Send fewer at a time.")

    matched: list[dict] = []
    skipped: list[dict] = []
    seen: set[uuid.UUID] = set()
    for info in entries:
        name = PurePosixPath(info.filename).name
        stem, ext = PurePosixPath(name).stem.strip(), PurePosixPath(name).suffix.lower()
        if ext not in EXTENSIONS:
            skipped.append({"file": name, "reason": "Not a JPEG, PNG or WebP picture"})
            continue
        if info.file_size > MAX_FILE_BYTES:
            skipped.append({"file": name, "reason": "Larger than 5MB"})
            continue
        data = archive.read(info)
        if len(data) > MAX_FILE_BYTES or not _looks_like_image(data):
            skipped.append({"file": name, "reason": "The file is not really a picture"})
            continue
        key = stem.lower()
        found = (await db.execute(select(Product).where(Product.tenant_id == tenant_id, or_(func.lower(Product.sku) == key, func.lower(Product.barcode) == key)))).unique().scalars().all()
        if not found:
            skipped.append({"file": name, "reason": "No product has this SKU or barcode"})
            continue
        if len(found) > 1:
            skipped.append({"file": name, "reason": "More than one product has this SKU or barcode"})
            continue
        product = found[0]
        if product.id in seen:
            skipped.append({"file": name, "reason": f"{product.name} already got a picture from this ZIP"})
            continue
        seen.add(product.id)
        if product.image_url and _is_uploaded_file(product.image_url):
            await storage.delete(product.image_url)
        product.image_url = await storage.save("products", name, data)
        matched.append({"file": name, "product": product.name, "sku": product.sku})
    await db.commit()
    return {"matched": len(matched), "skipped": len(skipped), "pictures": matched, "problems": skipped}


_ALIASES = {
    "sku": {"sku", "code", "itemcode", "productcode", "partnumber"},
    "barcode": {"barcode", "ean", "upc", "gtin"},
    "name": {"name", "productname", "product", "item", "itemname"},
}
MAX_SHEET_ROWS = 5000
MAX_PICTURES = 600
MAX_PER_ROW = 9  # one main picture and up to eight extras


def _sheet_rows(content: bytes) -> tuple[dict[str, int], dict[int, list]]:
    """({field: column index}, {row number: cell values}) for the first sheet. Row 1 is the header, exactly as the product import reads it."""
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    try:
        sheet = wb.worksheets[0]
        rows: dict[int, list] = {}
        for number, values in enumerate(sheet.iter_rows(values_only=True), start=1):
            if number > MAX_SHEET_ROWS:
                break
            rows[number] = list(values)
    finally:
        wb.close()
    header = rows.get(1, [])
    columns: dict[str, int] = {}
    for index, title in enumerate(header):
        key = "".join(ch for ch in str(title or "").lower() if ch.isalnum())
        for field, names in _ALIASES.items():
            if key in names and field not in columns:
                columns[field] = index
    return columns, rows


def _cell(values: list, columns: dict[str, int], field: str) -> str:
    index = columns.get(field)
    if index is None or index >= len(values) or values[index] is None:
        return ""
    value = values[index]
    return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value).strip()


async def _find_product(db: AsyncSession, tenant_id: uuid.UUID, sku: str, barcode: str, name: str) -> tuple[Product | None, str | None]:
    for label, column, value in (("SKU", Product.sku, sku), ("barcode", Product.barcode, barcode), ("name", Product.name, name)):
        if not value:
            continue
        found = (await db.execute(select(Product).where(Product.tenant_id == tenant_id, func.lower(column) == value.lower()))).unique().scalars().all()
        if len(found) == 1:
            return found[0], None
        if len(found) > 1:
            return None, f"More than one product has this {label}"
    return None, "No product matches this row's SKU, barcode or name"


async def import_workbook_pictures(db: AsyncSession, tenant_id: uuid.UUID, content: bytes) -> dict:
    """Pictures pasted into the rows of an Excel product sheet. Each row's first picture becomes the product's main picture and any others
    become its extra pictures. The row's product is found by SKU, then barcode, then name, so import the products first, then the same file."""
    try:
        found, _ = xlsx_pictures.extract(content)
    except xlsx_pictures.NotAWorkbook as exc:
        raise ValidationError(str(exc)) from exc
    pictures = [p for p in found if p.row > 1]  # a picture on the header row (a logo) belongs to no product
    if not pictures:
        raise ValidationError("No pictures were found in the first sheet. Paste each picture over the row of its product, or use a ZIP named by SKU.")
    columns, rows = _sheet_rows(content)
    if not columns:
        raise ValidationError("The first row must have headings such as name, sku or barcode, so each picture can be matched to its product.")
    by_row: dict[int, list] = {}
    for picture in pictures[:MAX_PICTURES]:
        by_row.setdefault(picture.row, []).append(picture)

    attached, problems, total, extras = [], [], 0, 0
    for row in sorted(by_row):
        label = f"Row {row}"
        values = rows.get(row, [])
        product, why = await _find_product(db, tenant_id, _cell(values, columns, "sku"), _cell(values, columns, "barcode"), _cell(values, columns, "name"))
        if product is None:
            problems.append({"file": label, "reason": why})
            continue
        usable = [p for p in by_row[row] if p.data]
        for bad in (p for p in by_row[row] if not p.data):
            problems.append({"file": label, "reason": bad.problem or "The picture could not be read"})
        if not usable:
            continue
        main, rest = usable[0], usable[1:MAX_PER_ROW]
        if len(usable) > MAX_PER_ROW:
            problems.append({"file": label, "reason": f"Only the first {MAX_PER_ROW} pictures of this row were used"})
        if product.image_url and _is_uploaded_file(product.image_url):
            await storage.delete(product.image_url)
        product.image_url = await storage.save("products", f"{product.sku or 'product'}-row{row}.jpg", main.data)
        count = 1
        for n, extra in enumerate(rest, start=2):
            outcome = await attach_extra(db, tenant_id, product.id, f"{product.sku or 'product'}-row{row}-{n}.jpg", extra.data)
            if outcome == "added":
                count += 1
                extras += 1
            elif outcome == "full":
                problems.append({"file": label, "reason": f"{product.name} already has the most extra pictures allowed"})
                break
        total += count
        attached.append({"file": label, "product": product.name, "sku": product.sku, "count": count})
    await db.commit()
    return {"source": "excel", "matched": len(attached), "skipped": len(problems), "pictures": attached, "problems": problems, "total_pictures": total, "extra_pictures": extras}
