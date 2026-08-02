from fastapi import APIRouter

from app.modules.hr.routes.applicant import router as applicant_router
from app.modules.hr.routes.attendance import router as attendance_router
from app.modules.hr.routes.employee import router as employee_router
from app.modules.hr.routes.leave import router as leave_router
from app.modules.hr.routes.payroll import router as payroll_router

hr_router = APIRouter()
hr_router.include_router(employee_router)
hr_router.include_router(attendance_router)
hr_router.include_router(leave_router)
hr_router.include_router(payroll_router)
hr_router.include_router(applicant_router)
