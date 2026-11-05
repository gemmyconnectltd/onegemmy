"""Extra pictures of a product. The main picture is Product.image_url; these sit beside it, and one can be promoted to main."""
import hashlib
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.integrations.storage import storage
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.product_image import MAX_GALLERY_IMAGES, ProductImage
from app.modules.inventory.service.product import _is_uploaded_file


async def _product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> Product:
    p = (await db.execute(select(Product).where(Product.id == id, Product.tenant_id == tenant_id))).unique().scalar_one_or_none()
    if p is None:
        raise NotFoundError("Product not found")
    return p


def _view(product: Product, images: list[ProductImage]) -> dict:
    return {"main": product.image_url, "gallery": [{"id": i.id, "url": i.url, "position": i.position} for i in images]}


async def _images(db: AsyncSession, product_id: uuid.UUID) -> list[ProductImage]:
    return list((await db.execute(select(ProductImage).where(ProductImage.product_id == product_id).order_by(ProductImage.position, ProductImage.created_at))).scalars())


async def gallery(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> dict:
    p = await _product(db, tenant_id, id)
    return _view(p, await _images(db, id))


async def add_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, filename: str, content: bytes) -> dict:
    p = await _product(db, tenant_id, id)
    count = (await db.execute(select(func.count()).select_from(ProductImage).where(ProductImage.product_id == id))).scalar_one()
    if count >= MAX_GALLERY_IMAGES:
        raise ConflictError(f"A product can have up to {MAX_GALLERY_IMAGES} extra pictures. Remove one first.")
    url = await storage.save("products", filename, content)
    db.add(ProductImage(tenant_id=tenant_id, product_id=id, url=url, position=count, sha256=hashlib.sha256(content).hexdigest()))
    await db.commit()
    return _view(p, await _images(db, id))


async def remove_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, image_id: uuid.UUID) -> dict:
    p = await _product(db, tenant_id, id)
    image = (await db.execute(select(ProductImage).where(ProductImage.id == image_id, ProductImage.product_id == id, ProductImage.tenant_id == tenant_id))).scalar_one_or_none()
    if image is None:
        raise NotFoundError("Picture not found")
    if _is_uploaded_file(image.url):
        await storage.delete(image.url)
    await db.delete(image)
    await db.commit()
    return _view(p, await _images(db, id))


async def make_main(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, image_id: uuid.UUID) -> dict:
    """Promotes a gallery picture to main. The old main picture takes its place in the gallery, unless it was only the bundled placeholder."""
    p = await _product(db, tenant_id, id)
    image = (await db.execute(select(ProductImage).where(ProductImage.id == image_id, ProductImage.product_id == id, ProductImage.tenant_id == tenant_id))).scalar_one_or_none()
    if image is None:
        raise NotFoundError("Picture not found")
    chosen, old_main = image.url, p.image_url
    p.image_url = chosen
    if old_main and _is_uploaded_file(old_main):
        image.url = old_main
    else:
        await db.delete(image)
    await db.commit()
    return _view(p, await _images(db, id))


async def attach_extra(db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID, filename: str, content: bytes) -> str:
    """Adds one extra picture without committing (the importer commits once). Returns "added", "duplicate" or "full"."""
    digest = hashlib.sha256(content).hexdigest()
    existing = (await db.execute(select(ProductImage.sha256).where(ProductImage.product_id == product_id))).scalars().all()
    if digest in existing:
        return "duplicate"
    if len(existing) >= MAX_GALLERY_IMAGES:
        return "full"
    url = await storage.save("products", filename, content)
    db.add(ProductImage(tenant_id=tenant_id, product_id=product_id, url=url, position=len(existing), sha256=digest))
    return "added"
