"""Pictures pasted into an Excel sheet, and the row each one belongs to.

An .xlsx file is a ZIP. A picture can be stored in three ways and traders use all of them:
  1. Floating picture (Insert > Picture, or paste): stored in a drawing, anchored to the cell it sits over.
  2. Excel 365 "Place in cell" picture: the cell carries a rich-value reference that points at the picture.
  3. WPS Office picture in a cell: the cell holds =DISPIMG("ID_...") and the picture is listed in cellimages.xml.
This module reads the first sheet (the one the importer reads) and returns, per sheet row, the pictures in left-to-right order. It reads the
package directly with hard size limits, so a hostile file cannot exhaust memory, and it never executes anything inside the workbook.
"""
import io
import posixpath
import re
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree as ET

from PIL import Image as PilImage

MAX_PART_BYTES = 25 * 1024 * 1024  # one XML part
MAX_MEDIA_BYTES = 12 * 1024 * 1024  # one picture as stored in the file; larger ones are skipped
MAX_UNPACKED_BYTES = 200 * 1024 * 1024
MAX_PARTS = 4000
EMU_PER_POINT = 12700
DEFAULT_ROW_POINTS = 15.0

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
R_ID = f"{{{NS['r']}}}id"
R_EMBED = f"{{{NS['r']}}}embed"
CELL_REF = re.compile(r"^([A-Z]+)(\d+)$")


class NotAWorkbook(Exception):
    """The file is not a readable .xlsx."""


@dataclass
class SheetPicture:
    row: int  # 1-based sheet row
    order: tuple[float, float]  # left-to-right, then top-to-bottom, for deciding which picture is the main one
    data: bytes
    problem: str | None = None  # why it cannot be used (unsupported format, too large)


def is_workbook(zf: zipfile.ZipFile) -> bool:
    names = set(zf.namelist())
    return "xl/workbook.xml" in names and "[Content_Types].xml" in names


class _Package:
    def __init__(self, zf: zipfile.ZipFile):
        infos = zf.infolist()
        if len(infos) > MAX_PARTS or sum(i.file_size for i in infos) > MAX_UNPACKED_BYTES:
            raise NotAWorkbook("The workbook is too large to read pictures from")
        self.zf = zf
        self.names = {i.filename for i in infos}
        self.sizes = {i.filename: i.file_size for i in infos}

    def xml(self, name: str) -> ET.Element | None:
        if name not in self.names or self.sizes[name] > MAX_PART_BYTES:
            return None
        try:
            return ET.fromstring(self.zf.read(name))
        except ET.ParseError:
            return None

    def media(self, name: str) -> bytes | None:
        if name not in self.names:
            return None
        if self.sizes[name] > MAX_MEDIA_BYTES:
            return b""  # present but too large: reported to the person as a problem
        return self.zf.read(name)

    def rels(self, part: str) -> dict[str, str]:
        """{relationship id: full path of its target} for a part."""
        folder, base = posixpath.split(part)
        root = self.xml(posixpath.join(folder, "_rels", base + ".rels"))
        out: dict[str, str] = {}
        if root is None:
            return out
        for rel in root.findall("pr:Relationship", NS):
            target = rel.get("Target", "")
            out[rel.get("Id", "")] = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(folder, target))
        return out


def _col_number(letters: str) -> int:
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def _first_sheet(pkg: _Package) -> str | None:
    wb = pkg.xml("xl/workbook.xml")
    if wb is None:
        return None
    sheet = wb.find("m:sheets/m:sheet", NS)
    if sheet is None:
        return None
    return pkg.rels("xl/workbook.xml").get(sheet.get(R_ID, ""))


def _row_heights(sheet: ET.Element) -> tuple[dict[int, float], float]:
    fmt = sheet.find("m:sheetFormatPr", NS)
    default = float(fmt.get("defaultRowHeight", DEFAULT_ROW_POINTS)) if fmt is not None else DEFAULT_ROW_POINTS
    heights = {}
    for row in sheet.iterfind("m:sheetData/m:row", NS):
        if row.get("ht") and row.get("r"):
            try:
                heights[int(row.get("r"))] = float(row.get("ht"))
            except ValueError:
                pass
    return heights, default


def _row_at(y_emu: float, heights: dict[int, float], default: float) -> int:
    """The 1-based row that contains this vertical position, counted from the top of the sheet."""
    row, top = 1, 0.0
    while row < 20000:
        height = heights.get(row, default) * EMU_PER_POINT
        if y_emu < top + height:
            return row
        top += height
        row += 1
    return row


def _y_of(row0: int, off: float, heights: dict[int, float], default: float) -> float:
    """Distance from the top of the sheet to a point `off` EMU into zero-based row `row0`."""
    return sum(heights.get(r, default) * EMU_PER_POINT for r in range(1, row0 + 1)) + off


def _int(el: ET.Element | None, path: str) -> int:
    node = el.find(path, NS) if el is not None else None
    try:
        return int(node.text) if node is not None and node.text else 0
    except ValueError:
        return 0


def _floating(pkg: _Package, sheet_path: str, sheet: ET.Element, heights: dict[int, float], default: float) -> list[tuple[int, tuple[float, float], str]]:
    """Pictures from the sheet's drawing: (row, order, media path). A picture that spans rows belongs to the row under its vertical middle."""
    found: list[tuple[int, tuple[float, float], str]] = []
    sheet_rels = pkg.rels(sheet_path)
    for drawing_ref in sheet.iterfind("m:drawing", NS):
        drawing_path = sheet_rels.get(drawing_ref.get(R_ID, ""))
        drawing = pkg.xml(drawing_path) if drawing_path else None
        if drawing is None:
            continue
        rels = pkg.rels(drawing_path)
        for anchor in list(drawing):
            tag = anchor.tag.rsplit("}", 1)[-1]
            if tag not in ("twoCellAnchor", "oneCellAnchor"):
                continue  # absolute anchors have no cell to belong to
            blip = anchor.find(".//xdr:pic//a:blip", NS)
            target = rels.get(blip.get(R_EMBED, "")) if blip is not None else None
            if not target:
                continue
            frm = anchor.find("xdr:from", NS)
            row0, row_off, col, col_off = _int(frm, "xdr:row"), _int(frm, "xdr:rowOff"), _int(frm, "xdr:col"), _int(frm, "xdr:colOff")
            top = _y_of(row0, row_off, heights, default)
            if tag == "twoCellAnchor":
                to = anchor.find("xdr:to", NS)
                bottom = _y_of(_int(to, "xdr:row"), _int(to, "xdr:rowOff"), heights, default)
            else:
                ext = anchor.find("xdr:ext", NS)
                bottom = top + (int(ext.get("cy", "0")) if ext is not None else 0)
            found.append((_row_at((top + bottom) / 2, heights, default), (float(col) + col_off / 1e9, top), target))
    return found


def _cells_with(sheet: ET.Element) -> list[tuple[int, int, str | None, str | None]]:
    """(row, column number, rich-value index or None, formula text or None) for every cell that could hold a picture."""
    out = []
    for c in sheet.iterfind("m:sheetData/m:row/m:c", NS):
        vm = c.get("vm")
        f = c.find("m:f", NS)
        formula = f.text if f is not None and f.text and "DISPIMG" in f.text.upper() else None
        if vm is None and formula is None:
            continue
        match = CELL_REF.match(c.get("r", ""))
        if match:
            out.append((int(match.group(2)), _col_number(match.group(1)), vm, formula))
    return out


def _in_cell_excel365(pkg: _Package, cells) -> list[tuple[int, tuple[float, float], str]]:
    """Excel 365 'Place in cell': cell vm -> metadata -> rich value -> related picture."""
    wanted = [(r, c, int(vm)) for r, c, vm, _ in cells if vm and vm.isdigit()]
    if not wanted:
        return []
    meta, values, rel_list = pkg.xml("xl/metadata.xml"), pkg.xml("xl/richData/rdrichvalue.xml"), pkg.xml("xl/richData/richValueRel.xml")
    structure = pkg.xml("xl/richData/rdrichvaluestructure.xml")
    if meta is None or values is None or rel_list is None:
        return []
    rv_for_vm = []  # vm (1-based) -> rich value index
    future = None
    for fm in meta.iterfind("m:futureMetadata", {"m": NS["m"]}):
        if fm.get("name") == "XLRICHVALUE":
            future = fm
    rvb_index = []
    if future is not None:
        for bk in future.iterfind("m:bk", NS):
            rvb = next((e for e in bk.iter() if e.tag.endswith("}rvb")), None)
            rvb_index.append(int(rvb.get("i", "0")) if rvb is not None else None)
    for bk in meta.iterfind("m:valueMetadata/m:bk", NS):
        rc = bk.find("m:rc", NS)
        v = int(rc.get("v", "0")) if rc is not None else 0
        rv_for_vm.append(rvb_index[v] if v < len(rvb_index) else None)
    # which value in a rich value is the picture's relationship index: the key named _rvRel:LocalImageIdentifier
    key_pos = {}
    if structure is not None:
        for i, s in enumerate(list(structure)):
            keys = [k.get("n") for k in list(s)]
            key_pos[i] = keys.index("_rvRel:LocalImageIdentifier") if "_rvRel:LocalImageIdentifier" in keys else 0
    rvs = list(values)
    rels = pkg.rels("xl/richData/richValueRel.xml")
    rel_ids = [e.get(R_ID, "") for e in list(rel_list)]
    out = []
    for row, col, vm in wanted:
        rv_i = rv_for_vm[vm - 1] if 0 < vm <= len(rv_for_vm) else None
        if rv_i is None or rv_i >= len(rvs):
            continue
        rv = rvs[rv_i]
        vals = [v.text for v in list(rv)]
        pos = key_pos.get(int(rv.get("s", "0")), 0)
        try:
            rel_id = rel_ids[int(vals[pos])]
        except (IndexError, ValueError, TypeError):
            continue
        if rels.get(rel_id):
            out.append((row, (float(col), 0.0), rels[rel_id]))
    return out


def _in_cell_wps(pkg: _Package, cells) -> list[tuple[int, tuple[float, float], str]]:
    """WPS Office: the cell holds =DISPIMG("ID_...") and xl/cellimages.xml maps that id to the picture."""
    wanted = [(r, c, f) for r, c, _, f in cells if f]
    root = pkg.xml("xl/cellimages.xml")
    if not wanted or root is None:
        return []
    rels = pkg.rels("xl/cellimages.xml")
    by_id = {}
    for pic in root.iter(f"{{{NS['xdr']}}}pic"):
        name = pic.find("xdr:nvPicPr/xdr:cNvPr", NS)
        blip = pic.find(".//a:blip", NS)
        if name is not None and blip is not None and rels.get(blip.get(R_EMBED, "")):
            by_id[name.get("name", "")] = rels[blip.get(R_EMBED, "")]
    out = []
    for row, col, formula in wanted:
        match = re.search(r'DISPIMG\(\s*"([^"]+)"', formula, re.IGNORECASE)
        if match and match.group(1) in by_id:
            out.append((row, (float(col), 0.0), by_id[match.group(1)]))
    return out


def _usable(data: bytes) -> tuple[bytes | None, str | None]:
    """The picture as JPEG/PNG/WebP bytes, converted or shrunk when needed, or the reason it cannot be used."""
    if not data:
        return None, "The picture is larger than 12MB"
    try:
        img = PilImage.open(io.BytesIO(data))
        fmt = (img.format or "").upper()
        width, height = img.size
        if width * height > 60_000_000:
            return None, "The picture has too many pixels"
        needs_shrink = len(data) > 4_500_000 or max(width, height) > 2400
        if fmt in ("JPEG", "PNG", "WEBP") and not needs_shrink:
            return data, None
        img.load()
        if max(width, height) > 2000:
            img.thumbnail((2000, 2000))
        out = io.BytesIO()
        if fmt == "PNG" and not needs_shrink:
            img.save(out, "PNG")
        else:
            (img.convert("RGB") if img.mode not in ("RGB", "L") else img).save(out, "JPEG", quality=85, optimize=True)
        return out.getvalue(), None
    except Exception:  # noqa: BLE001 - any unreadable picture (EMF/WMF, damaged data) is reported, never raised
        return None, "The picture format is not supported (use JPEG or PNG)"


def extract(content: bytes) -> tuple[list[SheetPicture], str]:
    """Every picture on the first sheet with the row it belongs to. Raises NotAWorkbook when the file is not an .xlsx."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise NotAWorkbook("That is not an Excel (.xlsx) file") from exc
    if not is_workbook(zf):
        raise NotAWorkbook("That is not an Excel (.xlsx) file")
    pkg = _Package(zf)
    sheet_path = _first_sheet(pkg)
    sheet = pkg.xml(sheet_path) if sheet_path else None
    if sheet is None:
        raise NotAWorkbook("The first sheet could not be read")
    heights, default = _row_heights(sheet)
    cells = _cells_with(sheet)
    located = _floating(pkg, sheet_path, sheet, heights, default) + _in_cell_excel365(pkg, cells) + _in_cell_wps(pkg, cells)
    pictures: list[SheetPicture] = []
    seen: set[tuple[int, str, int]] = set()
    for row, order, target in sorted(located, key=lambda x: (x[0], x[1])):
        raw = pkg.media(target)
        if raw is None:
            continue
        key = (row, target, hash(raw))
        if key in seen:  # the same picture placed twice on one row counts once
            continue
        seen.add(key)
        data, problem = _usable(raw)
        pictures.append(SheetPicture(row=row, order=order, data=data or b"", problem=problem))
    return pictures, sheet_path or ""
