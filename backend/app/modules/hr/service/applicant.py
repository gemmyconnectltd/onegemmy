import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.hr.models.applicant import Applicant
from app.modules.hr.repository import ApplicantRepository
from app.modules.hr.schemas import ApplicantCreate, ApplicantRead, ApplicantUpdate

VALID_STAGES = {"Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"}


async def list_applicants(db: AsyncSession, tenant_id: uuid.UUID, stage: str | None = None, offset: int = 0, limit: int = 50) -> list[ApplicantRead]:
    items = await ApplicantRepository(db).list_for_tenant(tenant_id, stage, offset, limit)
    return [ApplicantRead.model_validate(i) for i in items]


async def count_applicants(db: AsyncSession, tenant_id: uuid.UUID, stage: str | None = None) -> int:
    return await ApplicantRepository(db).count_for_tenant(tenant_id, stage)


async def get_applicant(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ApplicantRead:
    obj = await ApplicantRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Applicant not found")
    return ApplicantRead.model_validate(obj)


async def create_applicant(db: AsyncSession, tenant_id: uuid.UUID, data: ApplicantCreate) -> ApplicantRead:
    if data.stage not in VALID_STAGES:
        raise ValidationError(f"Invalid stage: {data.stage}")
    obj = Applicant(
        tenant_id=tenant_id,
        applied_date=data.applied_date or date.today(),
        **data.model_dump(exclude={"applied_date"}),
    )
    obj = await ApplicantRepository(db).save(obj)
    await db.commit()
    return ApplicantRead.model_validate(obj)


async def update_applicant(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ApplicantUpdate) -> ApplicantRead:
    repo = ApplicantRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Applicant not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    if obj.stage not in VALID_STAGES:
        raise ValidationError(f"Invalid stage: {obj.stage}")
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ApplicantRead.model_validate(obj)


async def delete_applicant(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = ApplicantRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Applicant not found")
    await repo.delete(obj)
    await db.commit()
