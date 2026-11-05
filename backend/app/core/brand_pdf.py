"""Company branding for printed documents: one place decides how the logo, the brand colour and the fallback mark look.

Every client-facing PDF (quotation, invoice, purchase order, statements, reports) uses these, so a business that uploads its logo and
picks a colour sees both on every document. A business without a logo gets a monogram of its initials in its own colour, never a blank gap.
"""
import re
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Image

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("brand_pdf")
DEFAULT_BRAND = "#16A34A"
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def brand_color(tenant, default: str = DEFAULT_BRAND) -> colors.Color:
    value = (getattr(tenant, "brand_color", None) or "").strip()
    return colors.HexColor(value if _HEX.match(value) else default)


def readable_on(color: colors.Color) -> colors.Color:
    """White text on a dark brand colour, near-black on a light one."""
    luminance = 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue
    return colors.white if luminance < 0.62 else colors.HexColor("#111827")


def _initials(name: str | None) -> str:
    words = [w for w in re.split(r"\W+", name or "") if w]
    return ("".join(w[0] for w in words[:2]) or "•").upper()


def monogram(tenant, size_mm: float = 18) -> Drawing:
    accent = brand_color(tenant)
    size = size_mm * mm
    d = Drawing(size, size)
    d.add(Rect(0, 0, size, size, rx=size * 0.22, ry=size * 0.22, fillColor=accent, strokeColor=None))
    initials = _initials(getattr(tenant, "name", None))
    font = size * (0.42 if len(initials) > 1 else 0.5)
    d.add(String(size / 2, size / 2 - font * 0.35, initials, fontName="Helvetica-Bold", fontSize=font, fillColor=readable_on(accent), textAnchor="middle"))
    return d


def logo_flowable(tenant, max_w_mm: float = 44, max_h_mm: float = 22):
    """The uploaded logo scaled to fit the box (aspect ratio kept), or the company monogram when there is none or it cannot be read."""
    url = getattr(tenant, "logo_url", None) or ""
    if url.startswith("/uploads/"):
        base = Path(settings.UPLOAD_DIR).resolve()
        path = (base / url[len("/uploads/"):]).resolve()
        if path.is_relative_to(base) and path.is_file():
            try:
                img = Image(str(path))
                scale = min(max_w_mm * mm / img.imageWidth, max_h_mm * mm / img.imageHeight)
                img.drawWidth, img.drawHeight = img.imageWidth * scale, img.imageHeight * scale
                img.hAlign = "LEFT"
                return img
            except (OSError, ValueError, TypeError, ZeroDivisionError):
                log.warning("brand_pdf.logo.skip", extra={"_extra_fields": {"path": str(path)}})
    return monogram(tenant, min(max_h_mm, 18))


def draw_brand_band(canvas, page_w: float, page_h: float, accent: colors.Color, height_mm: float = 5) -> None:
    """A solid strip of the brand colour across the top of the page."""
    canvas.saveState()
    canvas.setFillColor(accent)
    canvas.rect(0, page_h - height_mm * mm, page_w, height_mm * mm, stroke=0, fill=1)
    canvas.restoreState()
