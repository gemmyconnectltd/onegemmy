"""Branch membership checks for documents and company-wide operations."""
import uuid
from typing import Any


def has_branch_restriction(user: Any) -> bool:
    return getattr(user, "branch_ids", None) is not None or getattr(user, "branch_id", None) is not None


def branch_allowed(user: Any, branch_id: uuid.UUID | None) -> bool:
    assigned = getattr(user, "branch_ids", None)
    if assigned is not None:
        return branch_id is not None and str(branch_id) in {str(id) for id in assigned}
    return getattr(user, "branch_id", None) is None or user.branch_id == branch_id
