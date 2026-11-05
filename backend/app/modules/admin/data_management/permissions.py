"""Platform-level permissions for Data Management.

Being a platform administrator is not enough: each action is a separate permission, and none is granted automatically. They are given
one by one with `python -m scripts.grant_data_permissions`. Approval and execution are deliberately separate from requesting.
"""
from app.core.exceptions import ForbiddenError
from app.modules.tenants.models import User

VIEW = "data:view"            # open a business's records and counts
PREVIEW = "data:preview"      # run an impact analysis (creates a plan, changes nothing)
REQUEST = "data:request"      # submit a plan for approval / ask for an operation
APPROVE = "data:approve"      # decide on another administrator's request
EXECUTE = "data:execute"      # run an approved (or approval-free) plan
HISTORY = "data:history"      # read operation history
RECOVERY = "data:recovery"    # see recovery references and backups

ALL = (VIEW, PREVIEW, REQUEST, APPROVE, EXECUTE, HISTORY, RECOVERY)
LABELS = {
    VIEW: "View business records", PREVIEW: "Preview operations", REQUEST: "Request operations", APPROVE: "Approve operations",
    EXECUTE: "Execute operations", HISTORY: "View operation history", RECOVERY: "Access recovery functions",
}


def granted(admin: User) -> list[str]:
    return [p for p in (admin.platform_permissions or []) if p in ALL]


def has(admin: User, permission: str) -> bool:
    return permission in (admin.platform_permissions or [])


def require(admin: User, permission: str) -> None:
    if not has(admin, permission):
        raise ForbiddenError(f"Data Management permission required: {LABELS.get(permission, permission)}")
