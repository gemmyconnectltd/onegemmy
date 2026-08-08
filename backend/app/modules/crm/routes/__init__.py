from fastapi import APIRouter

from app.modules.crm.routes.campaign import router as campaign_router
from app.modules.crm.routes.email_log import router as email_router

crm_router = APIRouter()
crm_router.include_router(campaign_router)
crm_router.include_router(email_router)
