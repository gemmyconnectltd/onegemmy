import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.repairs.models.job import RepairJob, RepairJobPart
from app.modules.repairs.repository import RepairJobRepository
from app.modules.repairs.schemas import RepairJobCreate, RepairJobRead, RepairJobUpdate


def _to_read(obj: RepairJob) -> RepairJobRead:
    r = RepairJobRead.model_validate(obj)
    r.customer_name = obj.customer.name if obj.customer else None
    r.technician_name = obj.technician.full_name if obj.technician else None
    return r


async def list_jobs(db: AsyncSession, tenant_id: uuid.UUID, status: str | None, offset: int, limit: int) -> list[RepairJobRead]:
    items = await RepairJobRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [_to_read(i) for i in items]


async def count_jobs(db: AsyncSession, tenant_id: uuid.UUID, status: str | None) -> int:
    return await RepairJobRepository(db).count_for_tenant(tenant_id, status)


async def get_job(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> RepairJobRead:
    obj = await RepairJobRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Repair job not found")
    return _to_read(obj)


async def create_job(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: RepairJobCreate) -> RepairJobRead:
    repo = RepairJobRepository(db)
    job = RepairJob(
        tenant_id=tenant_id,
        job_number=await repo.next_job_number(tenant_id),
        device_type=data.device_type,
        device_brand=data.device_brand,
        device_model=data.device_model,
        serial_number=data.serial_number,
        imei=data.imei,
        device_condition=data.device_condition,
        reported_issue=data.reported_issue,
        estimated_cost=data.estimated_cost,
        promised_at=data.promised_at,
        customer_id=data.customer_id,
        assigned_to=data.assigned_to,
        created_by=user_id,
    )
    job = await repo.save(job)
    for p in data.parts:
        db.add(RepairJobPart(
            job_id=job.id,
            product_id=p.product_id,
            part_name=p.part_name,
            quantity=p.quantity,
            unit_cost=p.unit_cost,
            line_total=p.line_total,
        ))
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, job.id)
    return _to_read(obj)


async def update_job(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: RepairJobUpdate) -> RepairJobRead:
    repo = RepairJobRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Repair job not found")

    update_data = data.model_dump(exclude_unset=True, exclude={"parts"})
    for field, value in update_data.items():
        setattr(obj, field, value)

    if data.status in ("delivered", "cancelled") and obj.completed_at is None:
        obj.completed_at = datetime.now(UTC)

    if data.parts is not None:
        for part in obj.parts:
            await db.delete(part)
        await db.flush()
        for p in data.parts:
            db.add(RepairJobPart(
                job_id=obj.id,
                product_id=p.product_id,
                part_name=p.part_name,
                quantity=p.quantity,
                unit_cost=p.unit_cost,
                line_total=p.line_total,
            ))

    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return _to_read(obj)


async def delete_job(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await RepairJobRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Repair job not found")
    await RepairJobRepository(db).delete(obj)
    await db.commit()
