"""Company branding on printed documents: the colour, the logo, and a monogram instead of a blank gap."""
from types import SimpleNamespace

from PIL import Image as PilImage
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.platypus import Image

from app.core import brand_pdf
from app.core.config import settings


def test_brand_colour_falls_back_when_missing_or_invalid():
    assert brand_pdf.brand_color(SimpleNamespace(brand_color="#0B57D0")) == colors.HexColor("#0B57D0")
    for bad in (None, "", "blue", "#12", "javascript:1"):
        assert brand_pdf.brand_color(SimpleNamespace(brand_color=bad)) == colors.HexColor(brand_pdf.DEFAULT_BRAND)


def test_text_on_the_brand_colour_stays_readable():
    assert brand_pdf.readable_on(colors.HexColor("#0B57D0")) == colors.white
    assert brand_pdf.readable_on(colors.HexColor("#FDE047")) != colors.white


def test_a_business_without_a_logo_gets_a_monogram_and_one_with_a_logo_gets_it_scaled(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    tenant = SimpleNamespace(name="River Trading Ltd", brand_color="#0B57D0", logo_url=None)
    assert isinstance(brand_pdf.logo_flowable(tenant), Drawing)
    assert brand_pdf._initials("River Trading Ltd") == "RT" and brand_pdf._initials("") == "•"
    (tmp_path / "logos").mkdir()
    PilImage.new("RGB", (800, 200), "red").save(tmp_path / "logos" / "wide.png")
    tenant.logo_url = "/uploads/logos/wide.png"
    logo = brand_pdf.logo_flowable(tenant, 44, 22)
    assert isinstance(logo, Image) and abs(logo.drawWidth / logo.drawHeight - 4) < 0.01
    assert logo.drawWidth <= 44 * 72 / 25.4 + 0.1 and logo.drawHeight <= 22 * 72 / 25.4 + 0.1
    tenant.logo_url = "/uploads/logos/missing.png"  # a logo that was deleted still gives a branded mark
    assert isinstance(brand_pdf.logo_flowable(tenant), Drawing)
    tenant.logo_url = "/uploads/../../etc/passwd"  # never reads outside the uploads folder as an image
    assert isinstance(brand_pdf.logo_flowable(tenant), Drawing)
