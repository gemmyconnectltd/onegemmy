from fastapi import APIRouter

from app.modules.crm.routes.activity import router as activity_router
from app.modules.crm.routes.campaign import router as campaign_router
from app.modules.crm.routes.contacts import router as contacts_router
from app.modules.crm.routes.email_log import router as email_router
from app.modules.crm.routes.opportunities import router as opportunities_router

crm_router = APIRouter()
crm_router.include_router(contacts_router)
crm_router.include_router(opportunities_router)
crm_router.include_router(activity_router)
crm_router.include_router(campaign_router)
crm_router.include_router(email_router)
