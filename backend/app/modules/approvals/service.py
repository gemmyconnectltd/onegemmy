"""Requests and approvals for changes a person may ask for but not make: a new selling price, a stock count correction, a stock transfer.

Authority is one permission, approvals:approve (the business owner always holds it). Everyone with the underlying module permission
may *request*. Nobody decides their own request (the owner excepted), the decision is audited, and the people who need to know are
emailed: approvers when a request arrives, the requester and the General Manager when it is decided.
"""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ApprovalRequiredError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.modules.approvals.models import ApprovalRequest
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer
from app.modules.inventory.models.variant import ProductVariant
from app.modules.tenants.models import Role, User

log = get_logger("approvals")

KINDS = ("price_change", "stock_adjustment", "stock_transfer")
KIND_LABEL = {"price_change": "Price change", "stock_adjustment": "Stock adjustment", "stock_transfer": "Stock transfer", "credit": "Credit sale"}
GM_ROLE = "General Manager"
AUTHORITY = "approvals:approve"


def can_decide(user) -> bool:
    return bool(user.is_superuser or AUTHORITY in user.permissions_names)


def _num(value) -> float:
    return float(value if value is not None else 0)


def guard_direct_change(current: dict, updates: dict, can_approve: bool, labels: dict[str, str]) -> None:
    """A person without approval authority may not change a guarded field (price, stock) directly: they must send a request.
    Saving a form that merely re-sends the unchanged value is fine."""
    if can_approve:
        return
    changed = [labels[f] for f in labels if f in updates and updates[f] is not None and abs(_num(updates[f]) - _num(current.get(f))) > 1e-9]
    if changed:
        raise ApprovalRequiredError(f"Changing {' and '.join(changed)} needs approval. Send a request instead: someone with approval authority will review it.")


# ── Creating a request ────────────────────────────────────────────────────────

async def create_request(db: AsyncSession, user, *, kind: str, subject_id: uuid.UUID | None, branch_id: uuid.UUID | None, reason: str | None,
                         payload: dict, notify: bool = True) -> ApprovalRequest:
    if kind not in KINDS:
        raise ValidationError("Unknown kind of request")
    tenant_id = user.tenant_id
    reason = (reason or "").strip() or None
    title, snapshot = await _describe(db, tenant_id, kind, subject_id, payload)
    if kind in ("price_change", "stock_adjustment") and (reason is None or len(reason) < 5):
        raise ValidationError("Say why: give a short reason of at least 5 characters")
    existing = (await db.execute(select(ApprovalRequest).where(
        ApprovalRequest.tenant_id == tenant_id, ApprovalRequest.kind == kind, ApprovalRequest.subject_id == subject_id, ApprovalRequest.status == "pending",
    ))).scalars().first()
    if existing is not None:
        raise ConflictError("A request for this is already waiting for a decision")
    request = ApprovalRequest(
        tenant_id=tenant_id, branch_id=branch_id, kind=kind, status="pending", subject_id=subject_id, title=title, reason=reason,
        payload={**payload, **snapshot}, requested_by=user.id, requested_by_name=user.full_name or user.email,
    )
    db.add(request)
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=request.requested_by_name, action="approval.requested",
                       entity_type="approval", entity_id=str(request.id), summary=f"{KIND_LABEL[kind]} requested: {title}", changes={"payload": request.payload, "reason": reason})
    await db.commit()
    if notify:
        await notify_approvers(db, request)
    return request


async def _describe(db: AsyncSession, tenant_id: uuid.UUID, kind: str, subject_id: uuid.UUID | None, payload: dict) -> tuple[str, dict]:
    """Validate what is being asked for and capture what it is right now, so the decision is made on the facts at request time."""
    if kind == "stock_transfer":
        transfer = await db.get(StockTransfer, subject_id) if subject_id else None
        if transfer is None or transfer.tenant_id != tenant_id:
            raise NotFoundError("Transfer not found")
        return f"Transfer {transfer.transfer_number}", {"transfer_number": transfer.transfer_number}
    product = await db.get(Product, subject_id) if subject_id else None
    if product is None or product.tenant_id != tenant_id:
        raise NotFoundError("Product not found")
    variant = None
    if payload.get("variant_id"):
        variant = await db.get(ProductVariant, uuid.UUID(str(payload["variant_id"])))
        if variant is None or variant.product_id != product.id:
            raise NotFoundError("Variant not found")
    name = f"{product.name}" + (f" ({variant.sku or 'variant'})" if variant else "")
    if kind == "price_change":
        new_price = payload.get("new_price")
        if new_price is None or float(new_price) < 0:
            raise ValidationError("Give the new price (zero or more)")
        old = variant.price if variant is not None and hasattr(variant, "price") else product.price
        if abs(float(new_price) - _num(old)) < 1e-9:
            raise ValidationError("That is already the current price")
        return f"New price for {name}", {"old_price": _num(old), "new_price": float(new_price)}
    new_stock = payload.get("new_stock")
    if new_stock is None or float(new_stock) < 0:
        raise ValidationError("Give the counted stock (zero or more)")
    old = variant.stock if variant is not None else product.stock
    if abs(float(new_stock) - _num(old)) < 1e-9:
        raise ValidationError("That is already the recorded stock")
    return f"Stock of {name}", {"old_stock": _num(old), "new_stock": float(new_stock), "difference": float(new_stock) - _num(old)}


# ── Deciding ──────────────────────────────────────────────────────────────────

async def decide(db: AsyncSession, user, request_id: uuid.UUID, *, approve: bool, note: str | None) -> ApprovalRequest:
    if not can_decide(user):
        raise ForbiddenError("You don't have approval authority")
    request = await _get(db, user.tenant_id, request_id, lock=True)
    if request.status != "pending":
        raise ConflictError(f"This request was already {request.status}")
    if request.requested_by == user.id and not user.is_superuser:
        raise ForbiddenError("You can't decide your own request: someone else has to")
    note = (note or "").strip() or None
    if not approve and not note:
        raise ValidationError("Say why it is rejected, so the requester knows what to change")
    if approve:
        await _apply(db, request)
        request.applied_at = datetime.now(UTC)
    request.status = "approved" if approve else "rejected"
    request.decided_by, request.decided_by_name, request.decided_at, request.decision_note = user.id, user.full_name or user.email, datetime.now(UTC), note
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=request.decided_by_name, action=f"approval.{request.status}",
                       entity_type="approval", entity_id=str(request.id), summary=f"{KIND_LABEL[request.kind]} {request.status}: {request.title}", changes={"note": note, "payload": request.payload})
    await db.commit()
    await notify_decision(db, request)
    return request


async def _apply(db: AsyncSession, request: ApprovalRequest) -> None:
    payload = request.payload
    if request.kind == "stock_transfer":
        return  # approval unlocks the transfer; the people doing it still move it along
    product = await db.get(Product, request.subject_id)
    if product is None:
        raise NotFoundError("The product no longer exists")
    variant = await db.get(ProductVariant, uuid.UUID(str(payload["variant_id"]))) if payload.get("variant_id") else None
    if request.kind == "price_change":
        target = variant if variant is not None and hasattr(variant, "price") else product
        target.price = Decimal(str(payload["new_price"]))
    elif request.kind == "stock_adjustment":
        target = variant if variant is not None else product
        target.stock = Decimal(str(payload["new_stock"]))
    await db.flush()


async def cancel(db: AsyncSession, user, request_id: uuid.UUID) -> ApprovalRequest:
    request = await _get(db, user.tenant_id, request_id, lock=True)
    if request.requested_by != user.id and not user.is_superuser:
        raise ForbiddenError("Only the person who asked can withdraw a request")
    if request.status != "pending":
        raise ConflictError(f"This request was already {request.status}")
    request.status = "cancelled"
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name or user.email, action="approval.cancelled",
                       entity_type="approval", entity_id=str(request.id), summary=f"{KIND_LABEL[request.kind]} withdrawn: {request.title}")
    await db.commit()
    return request


async def _get(db: AsyncSession, tenant_id: uuid.UUID, request_id: uuid.UUID, lock: bool = False) -> ApprovalRequest:
    stmt = select(ApprovalRequest).where(ApprovalRequest.id == request_id, ApprovalRequest.tenant_id == tenant_id)
    row = (await db.execute(stmt.with_for_update() if lock else stmt)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Request not found")
    return row


# ── Transfers: moving stock needs an approved request ─────────────────────────

async def open_transfer_request(db: AsyncSession, user, transfer: StockTransfer) -> ApprovalRequest | None:
    """A person without approval authority who creates a transfer gets a request opened for it automatically."""
    if can_decide(user):
        return None
    return await create_request(db, user, kind="stock_transfer", subject_id=transfer.id, branch_id=transfer.from_branch_id or transfer.to_branch_id,
                                reason=transfer.notes, payload={})


async def require_transfer_approval(db: AsyncSession, user, transfer_id: uuid.UUID) -> None:
    """Starting or completing a transfer needs approval authority, or an approved request for that transfer."""
    if can_decide(user):
        return
    status = (await db.execute(select(ApprovalRequest.status).where(
        ApprovalRequest.tenant_id == user.tenant_id, ApprovalRequest.kind == "stock_transfer", ApprovalRequest.subject_id == transfer_id,
    ).order_by(ApprovalRequest.created_at.desc()).limit(1))).scalar_one_or_none()
    if status == "approved":
        return
    waiting = "It is waiting for approval." if status == "pending" else "Its request was rejected." if status == "rejected" else "No request was made for it."
    raise ApprovalRequiredError(f"This transfer can't be started or completed yet. {waiting}")


# ── Listing ───────────────────────────────────────────────────────────────────

def to_dict(r: ApprovalRequest) -> dict:
    return {"id": str(r.id), "kind": r.kind, "status": r.status, "title": r.title, "reason": r.reason, "payload": r.payload,
            "branch_id": str(r.branch_id) if r.branch_id else None, "subject_id": str(r.subject_id) if r.subject_id else None,
            "requested_by": r.requested_by_name, "requested_by_id": str(r.requested_by) if r.requested_by else None,
            "requested_at": r.created_at.isoformat() if r.created_at else None,
            "decided_by": r.decided_by_name, "decided_at": r.decided_at.isoformat() if r.decided_at else None, "decision_note": r.decision_note}


async def list_requests(db: AsyncSession, user, *, status: str | None, kind: str | None, mine: bool, offset: int, limit: int) -> tuple[list[dict], int]:
    from sqlalchemy import func
    stmt = select(ApprovalRequest).where(ApprovalRequest.tenant_id == user.tenant_id)
    if mine or not (can_decide(user) or "approvals:read" in user.permissions_names):
        stmt = stmt.where(ApprovalRequest.requested_by == user.id)  # people without the inbox see only their own
    if status:
        stmt = stmt.where(ApprovalRequest.status == status)
    if kind:
        stmt = stmt.where(ApprovalRequest.kind == kind)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(ApprovalRequest.created_at.desc()).offset(offset).limit(limit))).scalars().all()
    return [to_dict(r) for r in rows], total


# ── Who gets told ─────────────────────────────────────────────────────────────

async def _approver_emails(db: AsyncSession, tenant_id: uuid.UUID) -> list[tuple[str, str]]:
    roles = (await db.execute(select(Role).where(Role.tenant_id == tenant_id))).scalars().all()
    ids = [r.id for r in roles if any(p.name == AUTHORITY for p in r.permissions)]
    users = (await db.execute(select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True), (User.is_superuser.is_(True)) | (User.role_id.in_(ids))))).scalars().all()
    return [(u.email, u.full_name) for u in users if u.email]


async def _gm_emails(db: AsyncSession, tenant_id: uuid.UUID) -> list[tuple[str, str]]:
    rows = (await db.execute(select(User).join(Role, Role.id == User.role_id).where(User.tenant_id == tenant_id, User.is_active.is_(True), Role.name == GM_ROLE))).scalars().all()
    return [(u.email, u.full_name) for u in rows if u.email]


async def _send(recipients: list[tuple[str, str]], subject: str, title: str, body: str) -> None:
    from app.core.email import send_notice_email
    seen: set[str] = set()
    for email, _ in recipients:
        if email.lower() in seen:
            continue
        seen.add(email.lower())
        try:
            await send_notice_email(to=email, subject=subject, title=title, body_html=body, sender="admin")
        except Exception:  # noqa: BLE001 - a mail problem must never undo or block a decision
            log.warning("approvals.notify_failed", extra={"_extra_fields": {"to": email}})


async def notify_approvers(db: AsyncSession, request: ApprovalRequest) -> None:
    people = [p for p in await _approver_emails(db, request.tenant_id) if p[0] != (request.requested_by_name or "")]
    await _send(people, f"Approval needed: {request.title}", f"{KIND_LABEL[request.kind]} waiting for your decision",
                f"<p><strong>{request.requested_by_name}</strong> asked for: <strong>{request.title}</strong>.</p><p>Reason: {request.reason or '—'}</p><p>Open Approvals in Pesaa to approve or reject it.</p>")


async def notify_decision(db: AsyncSession, request: ApprovalRequest) -> None:
    people = list(await _gm_emails(db, request.tenant_id))
    requester = await db.get(User, request.requested_by) if request.requested_by else None
    if requester is not None and requester.email:
        people.append((requester.email, requester.full_name))
    verdict = "approved" if request.status == "approved" else "rejected"
    await _send(people, f"{KIND_LABEL[request.kind]} {verdict}: {request.title}", f"{KIND_LABEL[request.kind]} {verdict}",
                f"<p><strong>{request.decided_by_name}</strong> {verdict} <strong>{request.title}</strong>, asked by {request.requested_by_name}.</p><p>Note: {request.decision_note or '—'}</p>")
