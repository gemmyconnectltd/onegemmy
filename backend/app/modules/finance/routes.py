from fastapi import APIRouter

from app.core.deps import CurrentUser

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/ping")
async def ping(current_user: CurrentUser) -> dict[str, str]:
    return {"module": "finance", "tenant_id": str(current_user.tenant_id)}
