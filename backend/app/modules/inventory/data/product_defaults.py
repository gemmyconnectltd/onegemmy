# Default product image per Industry (see the register form's step 2, the
# only place a tenant's `industry` value is ever set) — assigned to a
# product's `image_url` at creation/edit time whenever no real photo is set,
# so a product is never left with a blank image. These are bundled static
# assets (backend/app/static/product-defaults/), not tenant uploads.
DEFAULT_PRODUCT_IMAGES: dict[str, str] = {
    "Retail": "/static/product-defaults/retail.svg",
    "Wholesale": "/static/product-defaults/wholesale.svg",
    "Manufacturing": "/static/product-defaults/manufacturing.svg",
    "Services": "/static/product-defaults/services.svg",
    "Hospitality": "/static/product-defaults/hospitality.svg",
    "Technology": "/static/product-defaults/technology.svg",
    "Agriculture": "/static/product-defaults/agriculture.svg",
    "Construction": "/static/product-defaults/construction.svg",
    "Healthcare": "/static/product-defaults/healthcare.svg",
    "Education": "/static/product-defaults/education.svg",
    "Other": "/static/product-defaults/other.svg",
}

FALLBACK_PRODUCT_IMAGE = DEFAULT_PRODUCT_IMAGES["Other"]


def default_product_image(industry: str | None) -> str:
    return DEFAULT_PRODUCT_IMAGES.get(industry or "", FALLBACK_PRODUCT_IMAGE)
