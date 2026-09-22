import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.sales.models.customer import Customer
from app.modules.sales.repository import CustomerRepository
from app.modules.sales.schemas import (
    CustomerBulkCreate,
    CustomerBulkResult,
    CustomerCreate,
    CustomerRead,
    CustomerUpdate,
)


async def list_customers(
    db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50, search: str | None = None,
    customer_type: str | None = None,
) -> list[CustomerRead]:
    items = await CustomerRepository(db).list_for_tenant(tenant_id, offset, limit, search, customer_type)
    return [CustomerRead.model_validate(i) for i in items]


async def count_customers(db: AsyncSession, tenant_id: uuid.UUID, search: str | None = None, customer_type: str | None = None) -> int:
    return await CustomerRepository(db).count_for_tenant(tenant_id, search, customer_type)


async def get_customer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> CustomerRead:
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Customer not found")
    return CustomerRead.model_validate(obj)


async def create_customer(db: AsyncSession, tenant_id: uuid.UUID, data: CustomerCreate) -> CustomerRead:
    obj = Customer(tenant_id=tenant_id, **data.model_dump())
    obj = await CustomerRepository(db).save(obj)
    await db.commit()
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return CustomerRead.model_validate(obj)


async def bulk_create_customers(db: AsyncSession, tenant_id: uuid.UUID, data: CustomerBulkCreate) -> CustomerBulkResult:
    """CSV-style bulk import. Skips rows that already exist (same email, or same
    name when no email is given) and rows that duplicate another row in the file,
    so re-running an import is harmless. Fail-soft per row: one bad record never
    aborts the rest."""
    repo = CustomerRepository(db)
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
            obj = Customer(tenant_id=tenant_id, **payload)
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
    return CustomerBulkResult(created=created, skipped=skipped, failed=failed, errors=errors)


async def update_customer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: CustomerUpdate) -> CustomerRead:
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Customer not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await CustomerRepository(db).save(obj)
    await db.commit()
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    return CustomerRead.model_validate(obj)


async def delete_customer(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await CustomerRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Customer not found")
    await CustomerRepository(db).delete(obj)
    await db.commit()
