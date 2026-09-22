import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.repository import SupplierRepository
from app.modules.inventory.schemas import (
    SupplierBulkCreate,
    SupplierBulkResult,
    SupplierCreate,
    SupplierRead,
    SupplierUpdate,
)


async def get_supplier(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> SupplierRead:
    obj = await SupplierRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier not found")
    return SupplierRead.model_validate(obj)


async def list_suppliers(
    db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20, search: str | None = None
) -> list[SupplierRead]:
    items = await SupplierRepository(db).list_for_tenant(tenant_id, offset, limit, search)
    return [SupplierRead.model_validate(i) for i in items]


async def count_suppliers(db: AsyncSession, tenant_id: uuid.UUID, search: str | None = None) -> int:
    return await SupplierRepository(db).count_for_tenant(tenant_id, search)


async def create_supplier(db: AsyncSession, tenant_id: uuid.UUID, data: SupplierCreate) -> SupplierRead:
    obj = Supplier(tenant_id=tenant_id, **data.model_dump())
    obj = await SupplierRepository(db).save(obj)
    await db.commit()
    return SupplierRead.model_validate(obj)


async def bulk_create_suppliers(db: AsyncSession, tenant_id: uuid.UUID, data: SupplierBulkCreate) -> SupplierBulkResult:
    """CSV-style bulk import. Skips rows that already exist (same email, or same
    name when no email is given) and duplicate rows inside the file, so re-running
    an import is harmless. Fail-soft per row: one bad record never aborts the rest."""
    repo = SupplierRepository(db)
    identities = await repo.list_identities_for_tenant(tenant_id)
    existing_emails = {email.strip().lower() for email, _ in identities if email}
    existing_names = {name.strip().lower() for _, name in identities}

    created = 0
    skipped = 0
    failed = 0
    errors: list[str] = []
    seen: set[str] = set()

    for item in data.items:
        name = item.name.strip()
        email = (item.email or "").strip().lower()

        if not name:
            skipped += 1
            errors.append("Row skipped: 'name' is required")
            continue
        if email:
            key = email
            if key in existing_emails:
                skipped += 1
                errors.append(f"{email}: already exists")
                continue
            if key in seen:
                skipped += 1
                errors.append(f"{email}: duplicate in file")
                continue
        else:
            key = name.lower()
            if key in existing_names:
                skipped += 1
                errors.append(f"{name}: already exists")
                continue
            if key in seen:
                skipped += 1
                errors.append(f"{name}: duplicate in file")
                continue

        try:
            payload = item.model_dump()
            if not payload.get("email"):
                payload["email"] = None
            if not payload.get("phone"):
                payload["phone"] = None
            if not payload.get("address"):
                payload["address"] = None
            obj = Supplier(tenant_id=tenant_id, **payload)
            await repo.save(obj)
            created += 1
            seen.add(key)
            if email:
                existing_emails.add(email)
            else:
                existing_names.add(name.lower())
        except (ConflictError, SQLAlchemyError) as e:
            await db.rollback()
            failed += 1
            errors.append(f"{item.email or item.name}: {e!s}")

    if created > 0:
        await db.commit()
    return SupplierBulkResult(created=created, skipped=skipped, failed=failed, errors=errors)


async def update_supplier(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: SupplierUpdate) -> SupplierRead:
    obj = await SupplierRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await SupplierRepository(db).save(obj)
    await db.commit()
    return SupplierRead.model_validate(obj)


async def delete_supplier(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await SupplierRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier not found")
    await SupplierRepository(db).delete(obj)
    await db.commit()
