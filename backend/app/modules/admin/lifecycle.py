"""Tenant lifecycle for platform administrators: suspend / reactivate, notify, recover access, export data and archive.

Principles: every action needs a platform admin, writes an audit record naming who did it, never exposes a password, never
deletes business records. "Delete" is an archive request that a second administrator must approve."""
import csv
import hashlib
import html
import io
import re
import uuid
import zipfile
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import Response
from openpyxl import Workbook
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select

from app.core.config import settings
from app.core.deps import DbSession, SuperUser
from app.core.email import send_notice_email, send_password_reset_email
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.response import success_response
from app.core.security import create_access_token, create_password_reset_token, decode_token
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.admin.analytics import invalidate_analytics_cache
from app.modules.admin.models import (
    TenantDeletionRequest,
    TenantExport,
    TenantNotification,
    TenantNotificationDelivery,
)
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant, User

router = APIRouter(prefix="/admin", tags=["Super Admin"])
URL = re.compile(r"^https?://[^\s]+$")


def actor_name(admin: User) -> str:
    return admin.full_name or admin.email


async def get_tenant(db, tenant_id: uuid.UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("Business not found")
    return tenant


async def owner_of(db, tenant_id: uuid.UUID) -> User | None:
    return (await db.execute(select(User).where(User.tenant_id == tenant_id, User.role == "owner", User.is_active.is_(True)).limit(1))).scalar_one_or_none()


def audit(db, admin: User, tenant: Tenant, action: str, summary: str, changes: dict | None = None):
    return record_audit(db, tenant_id=None, actor_user_id=admin.id, actor_name=actor_name(admin), action=action, entity_type="tenant",
                        entity_id=str(tenant.id), summary=summary, changes=changes)


# ── Suspend / reactivate ──────────────────────────────────────────────────────

class SuspendRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)
    confirm_name: str
    notify_owner: bool = True


class ReactivateRequest(BaseModel):
    note: str = Field(default="", max_length=500)


@router.post("/tenants/{tenant_id}/suspend")
async def suspend_tenant(tenant_id: uuid.UUID, data: SuspendRequest, db: DbSession, admin: SuperUser):
    tenant = await get_tenant(db, tenant_id)
    if tenant.archived_at is not None:
        raise ValidationError("This business is archived")
    if data.confirm_name.strip() != tenant.name.strip():
        raise ValidationError("The business name does not match")
    if not tenant.is_active:
        raise ConflictError("This business is already suspended or not yet active")
    tenant.is_active = False
    tenant.suspended_at, tenant.suspended_by, tenant.suspension_reason = datetime.now(UTC), admin.id, data.reason.strip()
    await audit(db, admin, tenant, "tenant.suspend", f"Tenant '{tenant.name}' suspended", {"reason": data.reason.strip()})
    await db.commit()
    invalidate_analytics_cache()
    notified = False
    if data.notify_owner and (owner := await owner_of(db, tenant_id)):
        notified = await send_notice_email(
            owner.email, f"Your Pesaa account for {tenant.name} has been suspended", "Account suspended",
            f"<p>Hi {html.escape(owner.full_name or 'there')},</p><p>Access to <strong>{html.escape(tenant.name)}</strong> has been suspended. "
            f"Your data and records are safe and nothing has been deleted.</p><p><strong>Reason:</strong> {html.escape(data.reason.strip())}</p>"
            "<p>Reply to this email or contact Pesaa support to have access restored.</p>", "Your data is safe; access is paused.")
    return success_response(data={"notified_owner": notified}, message="Business suspended")


@router.post("/tenants/{tenant_id}/activate")
async def reactivate_tenant(tenant_id: uuid.UUID, db: DbSession, admin: SuperUser, data: ReactivateRequest | None = None):
    tenant = await get_tenant(db, tenant_id)
    if tenant.archived_at is not None:
        raise ValidationError("Archived businesses cannot be activated")
    pending = tenant.subscription_status == "pending"
    if tenant.is_active:
        raise ConflictError("This business is already active")
    tenant.is_active = True
    if pending:
        tenant.subscription_status = "active"
    tenant.reactivated_at, tenant.reactivated_by = datetime.now(UTC), admin.id
    await audit(db, admin, tenant, "tenant.activate", f"Tenant '{tenant.name}' {'approved' if pending else 'reactivated'}", {"note": (data.note if data else "") or None})
    await db.commit()
    invalidate_analytics_cache()
    owner = await owner_of(db, tenant_id)
    if owner:
        if pending:
            from app.core.email import send_account_approved_email
            await send_account_approved_email(to=owner.email, full_name=owner.full_name, tenant_name=tenant.name,
                                              dashboard_url=f"{settings.FRONTEND_URL}/dashboard", sender="admin")
        else:
            await send_notice_email(owner.email, f"Access to {tenant.name} has been restored", "Account reactivated",
                                    f"<p>Hi {html.escape(owner.full_name or 'there')},</p><p>Access to <strong>{html.escape(tenant.name)}</strong> is active again. "
                                    "You can sign in as usual.</p>")
    return success_response(message="Business reactivated")


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationRequest(BaseModel):
    kind: Literal["announcement", "billing", "maintenance", "security"]
    audience: Literal["owner", "admins", "selected", "all"]
    user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=3, max_length=5000)
    action_url: str | None = Field(default=None, max_length=500)

    @field_validator("action_url")
    @classmethod
    def valid_link(cls, v: str | None) -> str | None:
        v = (v or "").strip() or None
        if v and not URL.match(v):
            raise ValueError("The link must start with http:// or https://")
        return v


async def recipients(db, tenant_id: uuid.UUID, data: NotificationRequest) -> list[User]:
    query = select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True))
    if data.audience == "owner":
        query = query.where(User.role == "owner")
    elif data.audience == "admins":
        query = query.where(or_(User.role.in_(["owner", "admin"]), User.is_superuser.is_(True)))
    elif data.audience == "selected":
        if not data.user_ids:
            raise ValidationError("Choose at least one user")
        query = query.where(User.id.in_(data.user_ids))  # tenant-scoped above, so a foreign id simply matches nobody
    return list((await db.execute(query.order_by(User.email))).scalars())


@router.post("/tenants/{tenant_id}/notifications", status_code=201)
async def send_notification(tenant_id: uuid.UUID, data: NotificationRequest, db: DbSession, admin: SuperUser):
    tenant = await get_tenant(db, tenant_id)
    users = await recipients(db, tenant_id, data)
    if not users:
        raise ValidationError("No active users match this audience")
    digest = hashlib.sha256("|".join([data.kind, data.audience, ",".join(sorted(str(u.id) for u in users)), data.subject, data.message, data.action_url or ""]).encode()).hexdigest()
    duplicate = (await db.execute(select(TenantNotification.id).where(
        TenantNotification.tenant_id == tenant_id, TenantNotification.content_hash == digest,
        TenantNotification.created_at >= datetime.now(UTC) - timedelta(minutes=10)).limit(1))).first()
    if duplicate:
        raise ConflictError("An identical notification was just sent to these recipients")
    note = TenantNotification(tenant_id=tenant_id, created_by=admin.id, kind=data.kind, audience=data.audience, subject=data.subject.strip(),
                              message=data.message.strip(), action_url=data.action_url, content_hash=digest, recipient_count=len(users))
    db.add(note)
    await db.flush()
    body = "".join(f"<p>{html.escape(line)}</p>" for line in data.message.strip().splitlines() if line.strip())
    if data.action_url:
        body += f"<p><a href=\"{html.escape(data.action_url, quote=True)}\">Open link</a></p>"
    sent = 0
    for user in users:
        ok = await send_notice_email(user.email, data.subject.strip(), data.subject.strip(), f"<p>Hi {html.escape(user.full_name or 'there')},</p>{body}",
                                     preheader=f"Message from Pesaa for {tenant.name}")
        sent += ok
        db.add(TenantNotificationDelivery(notification_id=note.id, user_id=user.id, email=user.email, status="sent" if ok else "failed",
                                          sent_at=datetime.now(UTC) if ok else None))
    note.sent_count, note.failed_count = sent, len(users) - sent
    note.status = "sent" if sent == len(users) else "partial" if sent else "failed"
    await audit(db, admin, tenant, "tenant.notify", f"Sent {data.kind} notification to {sent} of {len(users)} user(s)", {"subject": note.subject, "audience": data.audience})
    await db.commit()
    return success_response(data={"id": str(note.id), "status": note.status, "sent": sent, "failed": len(users) - sent, "recipients": len(users)},
                            message="Notification sent" if sent else "No email could be delivered", status_code=201)


@router.get("/tenants/{tenant_id}/notifications")
async def list_notifications(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, limit: int = Query(20, ge=1, le=100)):
    await get_tenant(db, tenant_id)
    rows = (await db.execute(select(TenantNotification).where(TenantNotification.tenant_id == tenant_id).order_by(TenantNotification.created_at.desc()).limit(limit))).scalars()
    return success_response(data=[{"id": str(n.id), "kind": n.kind, "audience": n.audience, "subject": n.subject, "status": n.status,
                                   "recipients": n.recipient_count, "sent": n.sent_count, "failed": n.failed_count, "created_at": n.created_at.isoformat()} for n in rows])


# ── Account recovery ──────────────────────────────────────────────────────────

@router.post("/tenants/{tenant_id}/users/{user_id}/recovery-link")
async def send_recovery_link(tenant_id: uuid.UUID, user_id: uuid.UUID, db: DbSession, admin: SuperUser):
    """Email the user a time-limited reset link. The admin never sees a password or the link."""
    tenant = await get_tenant(db, tenant_id)
    user = await db.get(User, user_id)
    if user is None or user.tenant_id != tenant_id:
        raise NotFoundError("User not found in this business")
    if not user.is_active:
        raise ValidationError("This user is deactivated; reactivate them before sending a recovery link")
    token = create_password_reset_token(str(user.id), {"tenant_id": str(tenant_id)})
    delivered = await send_password_reset_email(to=user.email, full_name=user.full_name, reset_link=f"{settings.FRONTEND_URL}/reset-password?token={token}")
    await audit(db, admin, tenant, "user.recovery_link", f"Recovery link {'sent' if delivered else 'failed to send'} for '{user.email}'", {"user_id": str(user.id), "delivered": delivered})
    await db.commit()
    if not delivered:
        raise ValidationError("The email could not be delivered. Try again shortly.")
    return success_response(data={"email": user.email}, message="Recovery link emailed to the user")


# ── Data export ───────────────────────────────────────────────────────────────

CATEGORIES = {
    "sales": ("Sales orders", Order), "inventory": ("Inventory", Product), "purchases": ("Purchases", PurchaseOrder), "expenses": ("Expenses", Expense),
    "customers": ("Customers", Customer), "suppliers": ("Suppliers", Supplier), "users": ("Users", User), "financial": ("Financial records", Transaction),
}
SENSITIVE = {"hashed_password", "password", "mfa_secret", "totp_secret", "refresh_token", "api_key"}
ROW_CAP = 100_000
EXPORT_TTL_MINUTES = 15


class ExportRequest(BaseModel):
    categories: list[Literal["sales", "inventory", "purchases", "expenses", "customers", "suppliers", "users", "financial"]] = Field(min_length=1)
    fmt: Literal["csv", "xlsx", "zip"] = "zip"
    date_from: date | None = None
    date_to: date | None = None


def export_columns(model) -> list:
    return [c for c in model.__table__.columns if c.name not in SENSITIVE and not c.name.endswith(("_hash", "_secret", "_token"))]


async def category_rows(db, tenant_id: uuid.UUID, key: str, start: date | None, end: date | None):
    _, model = CATEGORIES[key]
    columns = export_columns(model)
    query = select(*columns).where(model.tenant_id == tenant_id)
    created = getattr(model, "created_at", None)
    if created is not None and start:
        query = query.where(created >= datetime.combine(start, datetime.min.time(), UTC))
    if created is not None and end:
        query = query.where(created < datetime.combine(end + timedelta(days=1), datetime.min.time(), UTC))
    rows = (await db.execute(query.limit(ROW_CAP + 1))).all()
    return [c.name for c in columns], rows[:ROW_CAP], len(rows) > ROW_CAP


def cell(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return str(value)
    if isinstance(value, str) and value[:1] in "=+-@":
        return "'" + value  # spreadsheet formula injection guard
    return value if isinstance(value, (int, float, bool)) else str(value)


@router.post("/tenants/{tenant_id}/exports", status_code=201)
async def request_export(tenant_id: uuid.UUID, data: ExportRequest, db: DbSession, admin: SuperUser):
    tenant = await get_tenant(db, tenant_id)
    if data.date_from and data.date_to and data.date_from > data.date_to:
        raise ValidationError("The start date must be on or before the end date")
    if data.fmt == "csv" and len(data.categories) > 1:
        raise ValidationError("CSV holds one category; choose ZIP or Excel for several")
    categories = list(dict.fromkeys(data.categories))
    export = TenantExport(tenant_id=tenant_id, requested_by=admin.id, categories=categories, fmt=data.fmt, date_from=data.date_from, date_to=data.date_to,
                          expires_at=datetime.now(UTC) + timedelta(minutes=EXPORT_TTL_MINUTES))
    db.add(export)
    await db.flush()
    await audit(db, admin, tenant, "tenant.export_requested", f"Requested {data.fmt.upper()} export of {', '.join(categories)}", {"export_id": str(export.id)})
    await db.commit()
    token = create_access_token(str(admin.id), {"type": "tenant_export", "export": str(export.id), "tenant": str(tenant_id),
                                               "exp": int(export.expires_at.timestamp())})
    return success_response(data={"id": str(export.id), "expires_at": export.expires_at.isoformat(), "download_url": f"/admin/tenants/{tenant_id}/exports/{export.id}/download?token={token}"},
                            message="Export ready to download", status_code=201)


@router.get("/tenants/{tenant_id}/exports/{export_id}/download")
async def download_export(tenant_id: uuid.UUID, export_id: uuid.UUID, token: str, db: DbSession, admin: SuperUser):
    payload = decode_token(token)
    export = await db.get(TenantExport, export_id)
    if (payload is None or payload.get("type") != "tenant_export" or payload.get("export") != str(export_id) or payload.get("sub") != str(admin.id)
            or export is None or export.tenant_id != tenant_id):
        raise ForbiddenError("This download link is not valid for you")
    if export.expires_at < datetime.now(UTC):
        raise ForbiddenError("This download link has expired; request a new export")
    tenant = await get_tenant(db, tenant_id)
    notes, sheets = [], {}
    for key in export.categories:
        header, rows, truncated = await category_rows(db, tenant_id, key, export.date_from, export.date_to)
        sheets[key] = (header, rows)
        if truncated:
            notes.append(f"{CATEGORIES[key][0]} was limited to the first {ROW_CAP:,} rows.")
    slug = re.sub(r"[^a-z0-9-]+", "-", tenant.slug.lower()) or "business"
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    if export.fmt == "xlsx":
        book = Workbook(write_only=True)
        for key, (header, rows) in sheets.items():
            sheet = book.create_sheet(CATEGORIES[key][0][:31])
            sheet.append(header)
            for row in rows:
                sheet.append([cell(v) for v in row])
        buffer = io.BytesIO()
        book.save(buffer)
        content, media, name = buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"{slug}-{stamp}.xlsx"
    else:
        def csv_bytes(header, rows) -> bytes:
            out = io.StringIO()
            writer = csv.writer(out)
            writer.writerow(header)
            writer.writerows([cell(v) for v in row] for row in rows)
            return out.getvalue().encode("utf-8-sig")
        if export.fmt == "csv":
            header, rows = sheets[export.categories[0]]
            content, media, name = csv_bytes(header, rows), "text/csv; charset=utf-8", f"{slug}-{export.categories[0]}-{stamp}.csv"
        else:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
                for key, (header, rows) in sheets.items():
                    archive.writestr(f"{key}.csv", csv_bytes(header, rows))
                if notes:
                    archive.writestr("README.txt", "\n".join(notes))
            content, media, name = buffer.getvalue(), "application/zip", f"{slug}-{stamp}.zip"
    export.download_count += 1
    export.last_downloaded_at, export.last_downloaded_by = datetime.now(UTC), admin.id
    await audit(db, admin, tenant, "tenant.export_downloaded", f"Downloaded {export.fmt.upper()} export of {', '.join(export.categories)}", {"export_id": str(export.id)})
    await db.commit()
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.get("/tenants/{tenant_id}/exports")
async def list_exports(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    await get_tenant(db, tenant_id)
    rows = (await db.execute(select(TenantExport, User.full_name).outerjoin(User, User.id == TenantExport.requested_by)
                             .where(TenantExport.tenant_id == tenant_id).order_by(TenantExport.created_at.desc()).limit(20))).all()
    return success_response(data=[{"id": str(e.id), "categories": e.categories, "format": e.fmt, "requested_by": name, "created_at": e.created_at.isoformat(),
                                   "downloads": e.download_count, "last_downloaded_at": e.last_downloaded_at.isoformat() if e.last_downloaded_at else None} for e, name in rows])


# ── Archive (deletion) requests ───────────────────────────────────────────────

class DeletionRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)
    confirm_name: str
    acknowledge: bool


class DecisionRequest(BaseModel):
    note: str = Field(default="", max_length=500)


async def deletion_checks(db, tenant: Tenant) -> dict:
    last_export = (await db.execute(select(func.max(TenantExport.created_at)).where(TenantExport.tenant_id == tenant.id))).scalar_one()
    return {"subscription_status": tenant.subscription_status, "plan": tenant.subscription_plan, "is_active": tenant.is_active,
            "completed_orders": (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant.id, Order.status == "Completed"))).scalar_one(),
            "last_export_at": last_export.isoformat() if last_export else None,
            "warnings": [w for w in (
                "The subscription is still active; cancel or let it lapse first." if tenant.subscription_status == "active" and tenant.is_active else None,
                "No data export has been made for this business." if last_export is None else None) if w]}


@router.post("/tenants/{tenant_id}/deletion-requests", status_code=201)
async def request_archive(tenant_id: uuid.UUID, data: DeletionRequest, db: DbSession, admin: SuperUser):
    tenant = await get_tenant(db, tenant_id)
    if tenant.archived_at is not None:
        raise ConflictError("This business is already archived")
    if data.confirm_name.strip() != tenant.name.strip():
        raise ValidationError("The business name does not match")
    if not data.acknowledge:
        raise ValidationError("Confirm that you understand the business will lose access")
    if (await db.execute(select(TenantDeletionRequest.id).where(TenantDeletionRequest.tenant_id == tenant_id, TenantDeletionRequest.status == "pending").limit(1))).first():
        raise ConflictError("An archive request is already waiting for approval")
    request = TenantDeletionRequest(tenant_id=tenant_id, requested_by=admin.id, reason=data.reason.strip(), checks=await deletion_checks(db, tenant))
    db.add(request)
    await db.flush()
    await audit(db, admin, tenant, "tenant.archive_requested", f"Archive of '{tenant.name}' requested", {"reason": request.reason, "request_id": str(request.id)})
    await db.commit()
    return success_response(data={"id": str(request.id), "status": request.status, "checks": request.checks}, message="Archive request created; a second administrator must approve it", status_code=201)


@router.get("/tenants/{tenant_id}/deletion-requests")
async def list_archive_requests(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    tenant = await get_tenant(db, tenant_id)
    rows = (await db.execute(select(TenantDeletionRequest, User.full_name).outerjoin(User, User.id == TenantDeletionRequest.requested_by)
                             .where(TenantDeletionRequest.tenant_id == tenant_id).order_by(TenantDeletionRequest.created_at.desc()).limit(10))).all()
    return success_response(data={"archived_at": tenant.archived_at.isoformat() if tenant.archived_at else None,
                                  "requests": [{"id": str(r.id), "status": r.status, "reason": r.reason, "requested_by_id": str(r.requested_by) if r.requested_by else None,
                                                "requested_by": name, "created_at": r.created_at.isoformat(), "decided_at": r.decided_at.isoformat() if r.decided_at else None,
                                                "decision_note": r.decision_note, "checks": r.checks} for r, name in rows]})


async def decide(db, request_id: uuid.UUID, tenant_id: uuid.UUID, admin: User, status: str, note: str) -> tuple[Tenant, TenantDeletionRequest]:
    request = await db.get(TenantDeletionRequest, request_id)
    if request is None or request.tenant_id != tenant_id:
        raise NotFoundError("Archive request not found")
    if request.status != "pending":
        raise ConflictError("This request has already been decided")
    tenant = await get_tenant(db, tenant_id)
    request.status, request.decided_by, request.decided_at, request.decision_note = status, admin.id, datetime.now(UTC), note.strip() or None
    return tenant, request


@router.post("/tenants/{tenant_id}/deletion-requests/{request_id}/approve")
async def approve_archive(tenant_id: uuid.UUID, request_id: uuid.UUID, data: DecisionRequest, db: DbSession, admin: SuperUser):
    request = await db.get(TenantDeletionRequest, request_id)
    if request is not None and request.requested_by == admin.id:
        raise ForbiddenError("A different administrator must approve this request")
    tenant, request = await decide(db, request_id, tenant_id, admin, "executed", data.note)
    from app.modules.tenants.service import archive_tenant
    await archive_tenant(db, tenant_id)
    await audit(db, admin, tenant, "tenant.archive_approved", f"Archive of '{tenant.name}' approved and executed; records retained", {"request_id": str(request_id)})
    await db.commit()
    invalidate_analytics_cache()
    return success_response(message="Business archived. All records are retained.")


@router.post("/tenants/{tenant_id}/deletion-requests/{request_id}/reject")
async def reject_archive(tenant_id: uuid.UUID, request_id: uuid.UUID, data: DecisionRequest, db: DbSession, admin: SuperUser):
    tenant, _ = await decide(db, request_id, tenant_id, admin, "rejected", data.note)
    await audit(db, admin, tenant, "tenant.archive_rejected", f"Archive of '{tenant.name}' rejected", {"request_id": str(request_id)})
    await db.commit()
    return success_response(message="Archive request rejected")


@router.post("/tenants/{tenant_id}/deletion-requests/{request_id}/cancel")
async def cancel_archive(tenant_id: uuid.UUID, request_id: uuid.UUID, db: DbSession, admin: SuperUser):
    request = await db.get(TenantDeletionRequest, request_id)
    if request is not None and request.requested_by != admin.id:
        raise ForbiddenError("Only the requester can cancel; others can reject")
    tenant, _ = await decide(db, request_id, tenant_id, admin, "cancelled", "")
    await audit(db, admin, tenant, "tenant.archive_cancelled", f"Archive request for '{tenant.name}' cancelled", {"request_id": str(request_id)})
    await db.commit()
    return success_response(message="Archive request cancelled")
