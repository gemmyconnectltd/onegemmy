import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload, selectinload

from app.core.repository import BaseRepository
from app.modules.services.models.appointment import Appointment, AppointmentService

_INACTIVE_STATUSES = ("cancelled", "no_show")

_EAGER = (
    joinedload(Appointment.branch),
    joinedload(Appointment.customer),
    joinedload(Appointment.employee),
    selectinload(Appointment.services).joinedload(AppointmentService.service),
    selectinload(Appointment.services).joinedload(AppointmentService.employee),
)


class AppointmentRepository(BaseRepository[Appointment]):
    model = Appointment

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Appointment | None:
        result = await self.db.execute(
            select(Appointment).options(*_EAGER).where(Appointment.id == id, Appointment.tenant_id == tenant_id)
        )
        return result.unique().scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        offset: int = 0,
        limit: int = 20,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        status: str | None = None,
        employee_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        search: str | None = None,
    ) -> list[Appointment]:
        stmt = select(Appointment).options(*_EAGER).where(Appointment.tenant_id == tenant_id)
        stmt = self._filtered(stmt, date_from, date_to, status, employee_id, branch_id, search)
        stmt = stmt.order_by(Appointment.scheduled_start).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.unique().scalars().all())

    async def count_for_tenant(
        self,
        tenant_id: uuid.UUID,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        status: str | None = None,
        employee_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        search: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Appointment).where(Appointment.tenant_id == tenant_id)
        stmt = self._filtered(stmt, date_from, date_to, status, employee_id, branch_id, search)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    def _filtered(self, stmt, date_from, date_to, status, employee_id, branch_id, search):
        if date_from is not None:
            stmt = stmt.where(Appointment.scheduled_start >= date_from)
        if date_to is not None:
            stmt = stmt.where(Appointment.scheduled_start < date_to)
        if status:
            stmt = stmt.where(Appointment.status == status)
        if employee_id is not None:
            stmt = stmt.where(Appointment.employee_id == employee_id)
        if branch_id is not None:
            stmt = stmt.where(Appointment.branch_id == branch_id)
        if search:
            stmt = stmt.where(Appointment.customer_name.ilike(f"%{search}%"))
        return stmt

    async def find_overlapping_for_employee(
        self,
        tenant_id: uuid.UUID,
        employee_id: uuid.UUID,
        start: datetime,
        end: datetime,
        exclude_appointment_id: uuid.UUID | None = None,
    ) -> list[Appointment]:
        stmt = (
            select(Appointment)
            .where(
                Appointment.tenant_id == tenant_id,
                Appointment.employee_id == employee_id,
                Appointment.status.notin_(_INACTIVE_STATUSES),
                Appointment.scheduled_start < end,
                Appointment.scheduled_end > start,
            )
        )
        if exclude_appointment_id is not None:
            stmt = stmt.where(Appointment.id != exclude_appointment_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
