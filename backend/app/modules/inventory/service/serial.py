import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.inventory.models.serial import ProductSerial, WarrantyClaim
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.repository import ProductRepository, SerialRepository, WarrantyRepository
from app.modules.inventory.schemas import (
    SerialBulkCreate,
    SerialCreateItem,
    SerialRead,
    SerialUpdate,
    WarrantyClaimCreate,
    WarrantyClaimRead,
    WarrantyClaimUpdate,
)


async def _serial_to_read(obj: ProductSerial) -> SerialRead:
    read = SerialRead.model_validate(obj)
    read.product_name = obj.product.name if obj.product else None
    read.variant_attributes = obj.variant.attributes if obj.variant else None
    return read


async def _claim_to_read(obj: WarrantyClaim) -> WarrantyClaimRead:
    read = WarrantyClaimRead.model_validate(obj)
    read.serial_number = obj.serial.serial_number if obj.serial else None
    read.product_name = obj.serial.product.name if obj.serial and obj.serial.product else None
    return read


async def list_serials(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    product_id: uuid.UUID | None = None,
    status: str | None = None,
    offset: int = 0,
    limit: int = 20,
) -> list[SerialRead]:
    items = await SerialRepository(db).list_for_tenant(tenant_id, product_id, status, offset, limit)
    return [await _serial_to_read(s) for s in items]


async def count_serials(
    db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID | None = None, status: str | None = None
) -> int:
    return await SerialRepository(db).count_for_tenant(tenant_id, product_id, status)


async def get_serial(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> SerialRead:
    obj = await SerialRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Serial not found")
    return await _serial_to_read(obj)


async def create_serials(db: AsyncSession, tenant_id: uuid.UUID, data: SerialBulkCreate) -> list[SerialRead]:
    repo = SerialRepository(db)
    created: list[ProductSerial] = []
    seen: set[str] = set()
    for item in data.items:
        await _validate_serial_item(db, tenant_id, item)
        if item.serial_number in seen:
            raise ConflictError(f"Duplicate serial number in request: {item.serial_number}")
        seen.add(item.serial_number)
        existing = await repo.get_by_serial_number(tenant_id, item.serial_number)
        if existing is not None:
            raise ConflictError(f"Serial number already registered: {item.serial_number}")
        obj = ProductSerial(
            tenant_id=tenant_id,
            product_id=item.product_id,
            variant_id=item.variant_id,
            serial_number=item.serial_number,
            imei=item.imei,
            warranty_months=item.warranty_months,
            purchase_price=item.purchase_price,
            notes=item.notes,
        )
        obj = await repo.save(obj)
        created.append(obj)
    await db.commit()
    return [await _serial_to_read(s) for s in created]


async def _validate_serial_item(db: AsyncSession, tenant_id: uuid.UUID, item: SerialCreateItem) -> None:
    product = await ProductRepository(db).get_by_id_for_tenant(tenant_id, item.product_id)
    if product is None:
        raise ValidationError(f"Product '{item.product_id}' not found in this tenant")
    if not product.tracks_serials:
        raise ValidationError(f"Product '{product.name}' does not track serial numbers")
    if item.variant_id:
        variant = await db.get(ProductVariant, item.variant_id)
        if variant is None or variant.product_id != item.product_id:
            raise ValidationError("Variant does not belong to the selected product")


async def update_serial(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: SerialUpdate) -> SerialRead:
    obj = await SerialRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Serial not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await SerialRepository(db).save(obj)
    await db.commit()
    return await _serial_to_read(obj)


async def delete_serial(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await SerialRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Serial not found")
    if obj.status != "in_stock":
        raise ValidationError("Only in-stock serials can be deleted")
    await SerialRepository(db).delete(obj)
    await db.commit()


async def mark_serial_sold(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    serial_id: uuid.UUID,
    order_item_id: uuid.UUID,
    warranty_months: int,
) -> None:
    """Called from the order service when a Completed order line ships serials."""
    obj = await SerialRepository(db).get_by_id_for_tenant(tenant_id, serial_id)
    if obj is None:
        raise ValidationError(f"Serial not found in this tenant: {serial_id}")
    if obj.status != "in_stock":
        raise ValidationError(f"Serial '{obj.serial_number}' is not available for sale")
    obj.status = "sold"
    obj.order_item_id = order_item_id
    if warranty_months > 0:
        obj.warranty_months = warranty_months
        obj.warranty_expires_at = datetime.now(UTC) + timedelta(days=warranty_months * 30)


async def mark_serials_returned(db: AsyncSession, tenant_id: uuid.UUID, order_item_ids: list[uuid.UUID]) -> None:
    """Called when a return is approved: serials sold on those order lines go back to stock."""
    if not order_item_ids:
        return
    result = await db.execute(
        select(ProductSerial).where(
            ProductSerial.tenant_id == tenant_id,
            ProductSerial.order_item_id.in_(order_item_ids),
        )
    )
    for obj in result.scalars().all():
        obj.status = "returned"


async def list_warranty_claims(
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 20
) -> list[WarrantyClaimRead]:
    items = await WarrantyRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [await _claim_to_read(c) for c in items]


async def count_warranty_claims(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await WarrantyRepository(db).count_for_tenant(tenant_id, status)


async def get_warranty_claim(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> WarrantyClaimRead:
    obj = await WarrantyRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Warranty claim not found")
    return await _claim_to_read(obj)


async def create_warranty_claim(
    db: AsyncSession, tenant_id: uuid.UUID, data: WarrantyClaimCreate
) -> WarrantyClaimRead:
    serial = await SerialRepository(db).get_by_id_for_tenant(tenant_id, data.serial_id)
    if serial is None:
        raise NotFoundError("Serial not found")
    repo = WarrantyRepository(db)
    claim_number = await _next_claim_number(db, tenant_id)
    obj = WarrantyClaim(
        tenant_id=tenant_id,
        claim_number=claim_number,
        serial_id=data.serial_id,
        order_id=data.order_id or serial.order_item_id,
        issue_description=data.issue_description,
    )
    obj = await repo.save(obj)
    await db.commit()
    return await _claim_to_read(obj)


async def update_warranty_claim(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: WarrantyClaimUpdate
) -> WarrantyClaimRead:
    obj = await WarrantyRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Warranty claim not found")
    if data.status is not None:
        obj.status = data.status
        obj.completed_at = (
            datetime.now(UTC) if data.status in ("completed", "rejected", "refunded", "replaced") else None
        )
    if data.resolution_notes is not None:
        obj.resolution_notes = data.resolution_notes
    obj = await WarrantyRepository(db).save(obj)
    await db.commit()
    return await _claim_to_read(obj)


async def _next_claim_number(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    result = await db.execute(
        select(func.count()).select_from(WarrantyClaim).where(WarrantyClaim.tenant_id == tenant_id)
    )
    return f"WC-{str(result.scalar_one() + 1).zfill(4)}"
