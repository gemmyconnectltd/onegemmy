from app.modules.tenants.repository.branch import BranchRepository
from app.modules.tenants.repository.department import DepartmentRepository
from app.modules.tenants.repository.permission import PermissionRepository
from app.modules.tenants.repository.role import RoleRepository
from app.modules.tenants.repository.tenant import TenantRepository
from app.modules.tenants.repository.user import UserRepository

__all__ = [
    "BranchRepository", "DepartmentRepository", "PermissionRepository",
    "RoleRepository", "TenantRepository", "UserRepository",
]
