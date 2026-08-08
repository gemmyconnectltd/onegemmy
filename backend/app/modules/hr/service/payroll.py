import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.hr.models.payroll import PayrollEntry
from app.modules.hr.repository import PayrollRepository
from app.modules.hr.schemas import PayrollCreate, PayrollRead, PayrollUpdate


async def list_payroll(db: AsyncSession, tenant_id: uuid.UUID, period: str | None = None, status: str | None = None, offset: int = 0, limit: int = 50) -> list[PayrollRead]:
    items = await PayrollRepository(db).list_for_tenant(tenant_id, period, status, offset, limit)
    return [PayrollRead.model_validate(i) for i in items]


async def count_payroll(db: AsyncSession, tenant_id: uuid.UUID, period: str | None = None, status: str | None = None) -> int:
    return await PayrollRepository(db).count_for_tenant(tenant_id, period, status)


async def get_payroll(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PayrollRead:
    obj = await PayrollRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Payroll entry not found")
    return PayrollRead.model_validate(obj)


async def create_payroll(db: AsyncSession, tenant_id: uuid.UUID, data: PayrollCreate) -> PayrollRead:
    repo = PayrollRepository(db)
    existing = await repo.get_by_employee_period(tenant_id, data.employee_id, data.period)
    if existing is not None:
        raise ConflictError("A payroll entry already exists for this employee and period")
    obj = PayrollEntry(
        tenant_id=tenant_id,
        employee_id=data.employee_id,
        base_salary=data.base_salary,
        bonus=data.bonus,
        deductions=data.deductions,
        net_pay=round(data.base_salary + data.bonus - data.deductions, 2),
        period=data.period,
        status="Pending",
    )
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return PayrollRead.model_validate(obj)


async def update_payroll(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: PayrollUpdate) -> PayrollRead:
    repo = PayrollRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Payroll entry not found")
    if obj.status != "Pending":
        raise ValidationError(f"Only pending payroll entries can be edited (current: {obj.status})")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj.net_pay = round(obj.base_salary + obj.bonus - obj.deductions, 2)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PayrollRead.model_validate(obj)


async def mark_paid(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> PayrollRead:
    repo = PayrollRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Payroll entry not found")
    if obj.status == "Paid":
        raise ValidationError("Payroll entry is already paid")
    obj.status = "Paid"
    obj.paid_at = datetime.now(UTC)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return PayrollRead.model_validate(obj)


async def delete_payroll(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = PayrollRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Payroll entry not found")
    await repo.delete(obj)
    await db.commit()
