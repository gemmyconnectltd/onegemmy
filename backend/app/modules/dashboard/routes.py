from fastapi import APIRouter

from app.core.deps import CurrentUser

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/ping")
async def ping(current_user: CurrentUser) -> dict[str, str]:
    return {"module": "dashboard", "tenant_id": str(current_user.tenant_id)}
