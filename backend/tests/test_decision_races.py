"""A payment or decision is applied exactly once, even when two arrive together (a double click, two managers at once).

Each test reproduces the race: this request has already read the record as Pending, but another request has just
changed it in the database. The write must be refused instead of applying a second time."""
import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import update

from app.core.exceptions import ValidationError
from app.modules.hr.models.employee import Employee
from app.modules.hr.models.leave import LeaveRequest
from app.modules.hr.models.payroll import PayrollEntry
from app.modules.hr.service.leave import set_leave_status
from app.modules.hr.service.payroll import mark_paid
from app.modules.procurement.models.requisition import PurchaseRequisition
from app.modules.procurement.service.requisition import approve_requisition, reject_requisition
from app.modules.tenants.models import Tenant, User

pytestmark = pytest.mark.db


async def business(db):
    tenant = Tenant(name="Races", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    employee = Employee(tenant_id=tenant.id, employee_code="R1", first_name="Race", last_name="Test")
    manager = User(tenant_id=tenant.id, email=f"{uuid.uuid4()}@example.test", hashed_password="x", full_name="Manager")
    db.add_all([employee, manager])
    await db.flush()
    return tenant, employee, manager


async def changed_elsewhere(db, model, row_id, **values):
    """Another request's committed change, which the record already loaded in this session does not know about."""
    await db.execute(update(model).where(model.id == row_id).values(**values).execution_options(synchronize_session=False))
    await db.commit()


async def test_payroll_is_paid_once_when_two_payments_race(db):
    tenant, employee, _ = await business(db)
    entry = PayrollEntry(tenant_id=tenant.id, employee_id=employee.id, period="2026-11", base_salary=100, bonus=0, deductions=0, net_pay=100, status="Pending")
    db.add(entry)
    await db.commit()
    assert entry.status == "Pending"  # loaded here as Pending…
    await changed_elsewhere(db, PayrollEntry, entry.id, status="Paid", paid_at=datetime.now(UTC))  # …but just paid elsewhere
    with pytest.raises(ValidationError, match="already paid"):
        await mark_paid(db, tenant.id, entry.id)


async def test_leave_is_decided_once_when_two_decisions_race(db):
    tenant, employee, manager = await business(db)
    leave = LeaveRequest(tenant_id=tenant.id, employee_id=employee.id, leave_type="Annual", from_date=date(2026, 12, 1), to_date=date(2026, 12, 3), status="Pending")
    db.add(leave)
    await db.commit()
    assert leave.status == "Pending"
    await changed_elsewhere(db, LeaveRequest, leave.id, status="Approved")
    with pytest.raises(ValidationError, match="already Approved"):
        await set_leave_status(db, tenant.id, leave.id, "Rejected", manager.id)


async def test_requisition_is_decided_once_when_two_decisions_race(db):
    tenant, _, manager = await business(db)
    req = PurchaseRequisition(tenant_id=tenant.id, reference=f"PR-{uuid.uuid4().hex[:6]}", item_name="Paper", status="Pending")
    db.add(req)
    await db.commit()
    assert req.status == "Pending"
    await changed_elsewhere(db, PurchaseRequisition, req.id, status="Rejected")
    with pytest.raises(ValidationError, match="Rejected"):
        await approve_requisition(db, tenant.id, req.id, manager.id)


async def test_an_undecided_requisition_is_still_decided_normally(db):
    tenant, _, manager = await business(db)
    req = PurchaseRequisition(tenant_id=tenant.id, reference=f"PR-{uuid.uuid4().hex[:6]}", item_name="Ink", status="Pending")
    db.add(req)
    await db.commit()
    decided = await reject_requisition(db, tenant.id, req.id, manager.id)
    assert decided.status == "Rejected"
