import uuid

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.repository import BaseRepository
from app.modules.hr.models.employee import Employee
from app.modules.services.models.employee_service import EmployeeService


class EmployeeServiceRepository(BaseRepository[EmployeeService]):
    model = EmployeeService

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> EmployeeService | None:
        # EmployeeService has no tenant_id of its own — join through Employee
        # (already tenant-scoped) so a link can never be read across tenants.
        result = await self.db.execute(
            select(EmployeeService)
            .join(Employee, Employee.id == EmployeeService.employee_id)
            .options(joinedload(EmployeeService.employee), joinedload(EmployeeService.service))
            .where(EmployeeService.id == id, Employee.tenant_id == tenant_id)
        )
        return result.unique().scalar_one_or_none()

    async def get_by_employee_and_service(
        self, employee_id: uuid.UUID, service_id: uuid.UUID
    ) -> EmployeeService | None:
        result = await self.db.execute(
            select(EmployeeService).where(
                EmployeeService.employee_id == employee_id, EmployeeService.service_id == service_id
            )
        )
        return result.scalar_one_or_none()

    async def list_for_employee(self, employee_id: uuid.UUID) -> list[EmployeeService]:
        result = await self.db.execute(
            select(EmployeeService)
            .options(joinedload(EmployeeService.service))
            .where(EmployeeService.employee_id == employee_id)
        )
        return list(result.unique().scalars().all())

    async def list_for_service(self, service_id: uuid.UUID) -> list[EmployeeService]:
        result = await self.db.execute(
            select(EmployeeService)
            .options(joinedload(EmployeeService.employee))
            .where(EmployeeService.service_id == service_id)
        )
        return list(result.unique().scalars().all())

    async def list_for_tenant(self, tenant_id: uuid.UUID) -> list[EmployeeService]:
        result = await self.db.execute(
            select(EmployeeService)
            .join(Employee, Employee.id == EmployeeService.employee_id)
            .options(joinedload(EmployeeService.employee), joinedload(EmployeeService.service))
            .where(Employee.tenant_id == tenant_id)
        )
        return list(result.unique().scalars().all())
