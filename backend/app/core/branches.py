"""Branch membership checks for documents and company-wide operations."""
import uuid
from typing import Any


def has_branch_restriction(user: Any) -> bool:
    return getattr(user, "branch_ids", None) is not None or getattr(user, "branch_id", None) is not None


def visible_branches(user: Any, active: uuid.UUID | None) -> list[uuid.UUID] | None:
    """The branches a list should show: the workspace branch when one is chosen, otherwise the person's own branches when they are
    limited to some, otherwise None (every branch). Owners are never limited."""
    if active is not None:
        return [active]
    if getattr(user, "is_superuser", False):
        return None
    ids = getattr(user, "branch_ids", None)
    if ids is None:
        ids = [user.branch_id] if getattr(user, "branch_id", None) else None
    return None if ids is None else [uuid.UUID(str(i)) for i in ids if i]


def branch_allowed(user: Any, branch_id: uuid.UUID | None) -> bool:
    assigned = getattr(user, "branch_ids", None)
    if assigned is not None:
        return branch_id is not None and str(branch_id) in {str(id) for id in assigned}
    return getattr(user, "branch_id", None) is None or user.branch_id == branch_id
