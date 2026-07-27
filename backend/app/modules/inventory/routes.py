from fastapi import APIRouter

from app.core.deps import CurrentUser

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/ping")
async def ping(current_user: CurrentUser) -> dict[str, str]:
    return {"module": "inventory", "tenant_id": str(current_user.tenant_id)}
