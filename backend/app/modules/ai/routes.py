import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, SuperUser, get_active_branch_id
from app.core.response import success_response
from app.modules.ai import service

# Tenant-facing: scope (tenant, branch, permissions) is resolved server-side from the authenticated
# user for every request — the body carries only the question, the UI area and a conversation id.
router = APIRouter(prefix="/ai", tags=["AI"])
admin_router = APIRouter(prefix="/admin/ai", tags=["Super Admin - AI"])

BranchId = Annotated[uuid.UUID | None, Depends(get_active_branch_id)]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    module: str = "general"
    conversation_id: uuid.UUID | None = None


class AiSettingsUpdate(BaseModel):
    enabled: bool | None = None
    default_monthly_limit: int | None = Field(default=None, ge=0, le=1_000_000)
    plan_limits: dict[str, int] | None = None


@router.post("/chat")
async def chat(data: ChatRequest, db: DbSession, user: CurrentUser, branch_id: BranchId):
    ctx = await service.build_context(db, user, branch_id)
    reply = await service.chat(db, ctx, message=data.message.strip(), module=data.module, conversation_id=data.conversation_id)
    return success_response(data=reply.model_dump(mode="json"), message="Pesaa AI replied")


@router.get("/status")
async def status(db: DbSession, user: CurrentUser, branch_id: BranchId):
    ctx = await service.build_context(db, user, branch_id)
    cfg = await service.get_ai_settings(db)
    limit = await service.monthly_limit(db, ctx.tenant_id, cfg)
    used = await service.used_this_month(db, ctx.tenant_id)
    return success_response(data={
        "enabled": bool(cfg["enabled"]), "provider": service.provider_status()["active"],
        "monthly_limit": limit, "used_this_month": used, "remaining": max(0, limit - used),
    }, message="Pesaa AI status")


@router.get("/insights")
async def insights(db: DbSession, user: CurrentUser, branch_id: BranchId):
    """Dashboard insights: verified calculations only (no model call), cached for a few minutes."""
    ctx = await service.build_context(db, user, branch_id)
    cfg = await service.get_ai_settings(db)
    data = await service.insights(ctx) if cfg["enabled"] else []
    return success_response(data=data, message="Insights retrieved")


@router.post("/actions/{action_id}/confirm")
async def confirm_action(action_id: uuid.UUID, db: DbSession, user: CurrentUser, branch_id: BranchId):
    """The ONLY place an AI-prepared draft becomes a real record. Re-validates permission, prices and rules."""
    ctx = await service.build_context(db, user, branch_id)
    return success_response(data=await service.drafts.confirm_action(ctx, action_id), message="Created")


@router.post("/actions/{action_id}/cancel")
async def cancel_action(action_id: uuid.UUID, db: DbSession, user: CurrentUser, branch_id: BranchId):
    ctx = await service.build_context(db, user, branch_id)
    await service.drafts.cancel_action(ctx, action_id)
    return success_response(message="Draft discarded")


@router.get("/suggestions")
async def suggestions(db: DbSession, user: CurrentUser, branch_id: BranchId, module: str = "general"):
    ctx = await service.build_context(db, user, branch_id)
    return success_response(data=await service.suggestions(ctx, module), message="Suggestions")


@router.get("/conversations")
async def conversations(db: DbSession, user: CurrentUser, branch_id: BranchId):
    ctx = await service.build_context(db, user, branch_id)
    rows = await service.list_conversations(db, ctx)
    return success_response(
        data=[{"id": str(c.id), "title": c.title, "module": c.module, "updated_at": c.updated_at.isoformat() if c.updated_at else None} for c in rows],
        message="Conversations retrieved",
    )


@router.get("/conversations/{conversation_id}")
async def conversation(conversation_id: uuid.UUID, db: DbSession, user: CurrentUser, branch_id: BranchId):
    ctx = await service.build_context(db, user, branch_id)
    msgs = await service.get_messages(db, ctx, conversation_id)
    return success_response(
        data=[{"id": str(m.id), "role": m.role, "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None} for m in msgs],
        message="Conversation retrieved",
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: uuid.UUID, db: DbSession, user: CurrentUser, branch_id: BranchId):
    ctx = await service.build_context(db, user, branch_id)
    await service.delete_conversation(db, ctx, conversation_id)
    return success_response(message="Conversation deleted")


# ── super admin ───────────────────────────────────────────────────────────────

@admin_router.get("/settings")
async def get_settings(db: DbSession, _: SuperUser):
    return success_response(data={**await service.get_ai_settings(db), "provider": service.provider_status(), "model_env": settings.AI_MODEL}, message="AI settings retrieved")


@admin_router.put("/settings")
async def update_settings(data: AiSettingsUpdate, db: DbSession, admin: SuperUser):
    """Feature switch + usage limits. The provider and its API key are deployment configuration
    (environment variables), deliberately not editable — or readable — through the app."""
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    new = await service.set_ai_settings(db, changes, admin.id)
    await db.commit()
    return success_response(data=new, message="AI settings updated")


@admin_router.get("/usage")
async def usage(db: DbSession, _: SuperUser, days: Annotated[int, Query(ge=1, le=365)] = 30):
    return success_response(data=await service.usage_overview(db, days), message="AI usage retrieved")
