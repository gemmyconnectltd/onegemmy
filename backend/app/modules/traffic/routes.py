from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser, DbSession, get_current_active_superuser
from app.core.rate_limit import rate_limit
from app.core.response import success_response
from app.modules.admin.analytics import PeriodDep
from app.modules.traffic import classify, erp_service
from app.modules.traffic.models import ErpActivity, WebsiteVisit
from app.modules.traffic.service import (
    campaigns_detail,
    pages_detail,
    realtime_report,
    sources_detail,
    traffic_report,
)

public_router = APIRouter(prefix="/public", tags=["Website tracking"])
activity_router = APIRouter(prefix="/activity", tags=["App activity"])
admin_router = APIRouter(
    prefix="/admin/analytics",
    tags=["Super Admin - Website Traffic"],
    dependencies=[Depends(get_current_active_superuser)],
)


class VisitIn(BaseModel):
    visitor_id: str = Field(max_length=64)
    path: str = Field(max_length=300)
    referrer: str | None = Field(default=None, max_length=500)
    utm_source: str | None = Field(default=None, max_length=200)
    utm_medium: str | None = Field(default=None, max_length=200)
    utm_campaign: str | None = Field(default=None, max_length=200)


@public_router.post(
    "/visits", status_code=204,
    dependencies=[Depends(rate_limit("website-visit", limit=120, window_seconds=60))],
)
async def record_visit(data: VisitIn, request: Request, db: DbSession) -> Response:
    """Anonymous page-view beacon from the marketing website. Invalid or bot traffic is ignored silently."""
    path = classify.clean_path(data.path)
    if (
        path is None
        or not classify.VISITOR_ID_RE.match(data.visitor_id)
        or classify.is_bot(request.headers.get("user-agent"))
    ):
        return Response(status_code=204)
    origin = request.headers.get("origin") or ""
    own = {h for h in (classify.referrer_host(origin, set()),) if h}
    host = classify.referrer_host(data.referrer, own)
    medium, source = classify.clean_tag(data.utm_medium), classify.clean_tag(data.utm_source)
    db.add(WebsiteVisit(
        visitor_id=data.visitor_id, path=path, referrer_host=host,
        channel=classify.classify_channel(host, medium, source),
        utm_source=source, utm_medium=medium, utm_campaign=classify.clean_tag(data.utm_campaign),
    ))
    await db.commit()
    return Response(status_code=204)


@admin_router.get("/traffic")
async def website_traffic(period: PeriodDep):
    """Acquisition dashboard: visitors → signups → activated → paying, with sources, pages and campaigns.
    Platform-wide (never tenant-scoped); superadmin only."""
    return success_response(data=await traffic_report(period), message="Website traffic retrieved")




@admin_router.get("/traffic/realtime")
async def website_traffic_realtime():
    """Visitors on the website right now (last 30 minutes) and the last 48 hours, hour by hour. Superadmin only."""
    return success_response(data=await realtime_report(), message="Realtime website traffic retrieved")


@admin_router.get("/traffic/sources")
async def website_traffic_sources(period: PeriodDep):
    """Every channel with views, signups and conversion, a per-channel trend, and the top referring sites."""
    return success_response(data=await sources_detail(period), message="Traffic sources retrieved")


@admin_router.get("/traffic/pages")
async def website_traffic_pages(period: PeriodDep):
    """Every tracked page (up to 500) with visitors, views and the signups credited to it as a landing page."""
    return success_response(data=await pages_detail(period), message="Traffic pages retrieved")


@admin_router.get("/traffic/campaigns")
async def website_traffic_campaigns(period: PeriodDep):
    """Every UTM campaign with its source/medium breakdown, signups and paying customers."""
    return success_response(data=await campaigns_detail(period), message="Traffic campaigns retrieved")


# ── ERP Traffic (signed-in app usage) ─────────────────────────────────────────

class ActivityIn(BaseModel):
    session_id: str = Field(max_length=64)
    path: str = Field(max_length=300)


@activity_router.post(
    "", status_code=204,
    dependencies=[Depends(rate_limit("app-activity", limit=600, window_seconds=60))],
)
async def record_activity(data: ActivityIn, request: Request, user: CurrentUser, db: DbSession) -> Response:
    """Page-view beacon from the signed-in ERP/POS. Platform staff (no business) and malformed input are ignored."""
    path = classify.clean_path(data.path)
    if user.tenant_id is None or path is None or not classify.VISITOR_ID_RE.match(data.session_id):
        return Response(status_code=204)
    module = classify.erp_module(path)
    ua = request.headers.get("user-agent", "")
    db.add(ErpActivity(
        tenant_id=user.tenant_id, user_id=user.id, session_id=data.session_id, module=module,
        surface="pos" if module == "pos" else "erp", path=path,
        device=classify.device_type(ua), os=classify.os_name(ua), browser=classify.browser_name(ua),
    ))
    await db.commit()
    return Response(status_code=204)


@admin_router.get("/erp-traffic")
async def erp_traffic(period: PeriodDep):
    """How businesses use the ERP: active users/businesses, sessions, modules, most active and quiet businesses."""
    return success_response(data=await erp_service.erp_report(period), message="ERP traffic retrieved")


@admin_router.get("/erp-traffic/realtime")
async def erp_traffic_realtime():
    return success_response(data=await erp_service.erp_realtime(), message="Realtime ERP traffic retrieved")


@admin_router.get("/erp-traffic/modules")
async def erp_traffic_modules(period: PeriodDep):
    return success_response(data=await erp_service.modules_detail(period), message="ERP modules retrieved")


@admin_router.get("/erp-traffic/businesses")
async def erp_traffic_businesses(period: PeriodDep):
    return success_response(data=await erp_service.businesses_detail(period), message="ERP businesses retrieved")


@admin_router.get("/erp-traffic/devices")
async def erp_traffic_devices(period: PeriodDep):
    return success_response(data=await erp_service.devices_detail(period), message="ERP devices retrieved")


@admin_router.get("/erp-traffic/engagement")
async def erp_traffic_engagement(period: PeriodDep):
    return success_response(data=await erp_service.engagement_detail(period), message="ERP engagement retrieved")
