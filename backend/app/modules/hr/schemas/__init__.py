from app.modules.hr.schemas.applicant import ApplicantCreate, ApplicantRead, ApplicantUpdate
from app.modules.hr.schemas.attendance import AttendanceCreate, AttendanceRead, AttendanceUpdate
from app.modules.hr.schemas.employee import DepartmentRef, EmployeeCreate, EmployeeRead, EmployeeUpdate
from app.modules.hr.schemas.leave import LeaveCreate, LeaveRead, LeaveUpdate
from app.modules.hr.schemas.payroll import PayrollCreate, PayrollRead, PayrollUpdate

__all__ = [
    "ApplicantCreate",
    "ApplicantRead",
    "ApplicantUpdate",
    "AttendanceCreate",
    "AttendanceRead",
    "AttendanceUpdate",
    "DepartmentRef",
    "EmployeeCreate",
    "EmployeeRead",
    "EmployeeUpdate",
    "LeaveCreate",
    "LeaveRead",
    "LeaveUpdate",
    "PayrollCreate",
    "PayrollRead",
    "PayrollUpdate",
]
