"""Shared authorization for every inventory route, including bulk and variant writes."""
from fastapi import Request

from app.core.branches import has_branch_restriction
from app.core.deps import CurrentUser, require_permission
from app.core.exceptions import ForbiddenError


async def inventory_access(request: Request, user: CurrentUser) -> None:
    path = request.url.path
    # A person limited to some branches may START a transfer that involves their branch (the route checks that): it always waits for
    # an approval, so company-wide stock is never moved on their say-so. Everything else about transfers stays with company-wide users.
    starts_transfer = request.method == "POST" and path.rstrip("/").endswith("/inventory/transfers")
    if "/transfers" in path and has_branch_restriction(user) and not starts_transfer:
        raise ForbiddenError("Stock transfers currently use company-wide stock. Ask an owner with company-wide access to manage this transfer.")
    action = {"GET": "read", "POST": "create", "PATCH": "update", "PUT": "update",
              "DELETE": "delete"}.get(request.method, "read")
    stock_operation = any(part in path for part in ("/restock", "/transfers", "/reports/valuation", "/low-stock"))
    if stock_operation and request.method != "GET" and has_branch_restriction(user) and not starts_transfer:
        raise ForbiddenError("Direct stock corrections use company-wide balances. Ask an owner with company-wide access to make this correction.")
    resource = "stock" if stock_operation else "items"
    await require_permission(f"{resource}:{action}")(user)
    if request.method in ("POST", "PATCH", "PUT") and "application/json" in request.headers.get("content-type", ""):
        data = await request.json()
        rows = data.get("items", []) if isinstance(data, dict) else []
        rows = rows if isinstance(rows, list) else []
        if isinstance(data, dict) and ("stock" in data or any(isinstance(row, dict) and "stock" in row for row in rows)):
            await require_permission("stock:update")(user)
            if has_branch_restriction(user):
                raise ForbiddenError("Direct stock corrections use company-wide balances. Ask an owner with company-wide access to make this correction.")
