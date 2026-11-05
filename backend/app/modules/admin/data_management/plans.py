"""The life of a data operation: prepare, submit, approve, execute.

Prepare changes nothing: it fixes the exact records, runs the impact analysis and stores the plan with an expiry. Submit asks for the
decision. Execute re-checks everything from scratch (permission, business, eligibility, record versions, plan integrity, expiry) and then
does the records one at a time through their own services. Nothing is assumed to be undoable: each record has its own outcome.
"""
import hashlib
import json
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.admin.data_management import opening
from app.modules.admin.data_management import permissions as perms
from app.modules.admin.data_management.explorer import (
    has_date_limit,
    resolve_selection,
    spec_for,
    tenant_of,
    tz_of,
)
from app.modules.admin.data_management.models import DataOperation, DataOperationItem
from app.modules.admin.data_management.operations import Assessment, assess, rows_for, run_one
from app.modules.audit.service import record_audit
from app.modules.tenants.models import User

PLAN_TTL = timedelta(minutes=60)       # a preview that is not submitted goes stale
DECISION_WINDOW = timedelta(hours=72)  # how long an approver has
EXECUTE_WINDOW = timedelta(hours=24)   # how long an approved plan may still be run
APPROVAL_OVER = 50                     # archiving more than this many records needs a second administrator
MAX_DETAILED_ELIGIBLE = 500
DESTRUCTIVE = ("delete", "clean_test")
RESTRICTIONS = {
    "delete": ["Permanent. No backup system is configured for this platform, so a deleted record cannot be restored. A snapshot of its key fields is kept in the operation history for reference only.",
               "Only records with no financial, stock or history references are removed. Everything else is listed as blocked with the supported alternative."],
    "clean_test": ["Permanent, like Delete. Records are not recognised as test data automatically: you review them and confirm they are disposable.",
                   "Only records with no financial, stock or history references are removed, whatever they are called."],
    "archive": ["Reversible. The records stay in the business with all their history and can be restored by the business."],
    "correct": ["Applied through the module's own workflow. The change and its reason are written to the business's audit trail."],
    "reset": ["The books are locked through the closing date. Nothing is deleted or re-posted. The business can reopen the period with a reason."],
}


def _hash(plan: dict) -> str:
    return hashlib.sha256(json.dumps(plan, sort_keys=True, default=str).encode()).hexdigest()


def plan_fingerprint(op: DataOperation) -> str:
    return _hash({"tenant": str(op.tenant_id), "module": op.module, "operation": op.operation, "ids": sorted(op.record_ids), "versions": op.versions, "payload": op.payload})


def approval_needed(operation: str, module: str, eligible: int, payload: dict) -> bool:
    if operation in (*DESTRUCTIVE, "reset"):
        return True
    if operation == "archive":
        return eligible > APPROVAL_OVER
    return operation == "correct" and module == "sales" and payload.get("action") == "void"


def _name(admin: User) -> str:
    return admin.full_name or admin.email


def dump(op: DataOperation, *, full: bool = False) -> dict:
    out = {
        "id": str(op.id), "reference": op.reference, "tenant_id": str(op.tenant_id), "tenant_name": op.tenant_name, "module": op.module, "operation": op.operation, "status": op.status,
        "reason": op.reason, "approval_required": op.approval_required, "requested_by": op.requested_by_name, "requested_by_id": str(op.requested_by) if op.requested_by else None,
        "decided_by": op.decided_by_name, "decision_note": op.decision_note, "decided_at": op.decided_at, "executed_by": op.executed_by_name, "created_at": op.created_at,
        "submitted_at": op.submitted_at, "started_at": op.started_at, "finished_at": op.finished_at, "expires_at": op.expires_at, "selected": op.analysis.get("summary", {}).get("selected", len(op.record_ids)), "affected": op.affected_count,
        "summary": op.analysis.get("summary", {}), "restrictions": op.analysis.get("restrictions", []), "payload": op.payload, "result": op.result,
    }
    if full:
        out |= {"filters": op.filters, "selection": op.selection, "analysis": op.analysis, "plan_hash": op.plan_hash, "versions_count": len(op.versions)}
    return out


async def _versions(db: AsyncSession, spec, ids: list[uuid.UUID]) -> dict[str, str]:
    if not hasattr(spec.base, "updated_at"):
        return {}
    return {str(i): (u.isoformat() if u else "") for i, u in (await db.execute(select(spec.base.id, spec.base.updated_at).where(spec.base.id.in_(ids)))).all()}


async def _get(db: AsyncSession, op_id: uuid.UUID, lock: bool = False) -> DataOperation:
    stmt = select(DataOperation).where(DataOperation.id == op_id)
    if lock:
        stmt = stmt.with_for_update()
    op = (await db.execute(stmt.execution_options(populate_existing=True))).scalar_one_or_none()
    if op is None:
        raise NotFoundError("Operation not found")
    return op


async def _event(db: AsyncSession, op: DataOperation, admin: User | None, action: str, note: str | None = None) -> None:
    """Every state change is also written to the append-only audit log, on the business's own trail and attributed to the platform administrator."""
    await record_audit(db, tenant_id=op.tenant_id, actor_user_id=admin.id if admin else None, actor_name=f"{_name(admin)} (platform)" if admin else "system", action=f"data_operation.{action}",
                       entity_type="data_operation", entity_id=str(op.id), summary=f"{op.reference}: {op.operation.replace('_', ' ')} {op.module} {action}", changes={"status": op.status, "note": note})


async def prepare(db: AsyncSession, admin: User, tenant_id: uuid.UUID, module: str, operation: str, selection: dict | None, payload: dict | None) -> dict:
    perms.require(admin, perms.PREVIEW)
    tenant = await tenant_of(db, tenant_id)
    payload = dict(payload or {})
    now = datetime.now(UTC)
    ref = f"DM-{now.year}-{secrets.token_hex(3).upper()}"
    if operation == "reset":
        if module != "accounting":
            raise ValidationError("Closing a period is done from the Accounting module")
        try:
            closing = date.fromisoformat(str(payload.get("closing_date")))
        except ValueError as exc:
            raise ValidationError("Choose the closing date") from exc
        spec_for(module)
        data = await opening.preview(db, tenant, closing)
        eligible_ids: list[uuid.UUID] = []
        analysis = {"summary": {"selected": 1, "eligible": 0 if data["blockers"] else 1, "blocked": len(data["blockers"])}, "preview": data, "blockers": data["blockers"],
                    "assessments": [], "related": {}, "restrictions": RESTRICTIONS["reset"]}
        record_ids, versions, selection, filters = [], {}, {"mode": "period", "closing_date": closing.isoformat()}, {}
    else:
        spec = spec_for(module)
        cap = spec.cap(operation)
        if not cap.supported:
            raise ValidationError(cap.why or "This operation is not available for this module")
        selection = selection or {}
        filters = selection.get("filters") or {}
        if selection.get("mode") == "matching" and operation in (*DESTRUCTIVE, "archive") and not has_date_limit(spec, filters, tz_of(tenant)) and not payload.get("confirm_all_dates"):
            raise ValidationError("This selection covers all dates. Confirm that you mean every date, or choose a date range.")
        record_ids, missing = await resolve_selection(db, tenant, module, selection)
        results = await assess(db, tenant, module, operation, record_ids, payload)
        eligible = [a for a in results if a.eligible]
        eligible_ids = [a.id for a in eligible]
        related: dict[str, int] = {}
        for a in eligible:
            for k, v in a.related.items():
                related[k] = related.get(k, 0) + v
        blocked = [a.dump() for a in results if not a.eligible]
        analysis = {
            "summary": {"selected": len(record_ids), "eligible": len(eligible), "blocked": len(blocked)},
            "assessments": blocked + [a.dump() for a in eligible[:MAX_DETAILED_ELIGIBLE]], "eligible_shown": min(len(eligible), MAX_DETAILED_ELIGIBLE),
            "related": related, "restrictions": RESTRICTIONS[operation], "not_found": missing["missing"], "external_integrations": [],
        }
        versions = await _versions(db, spec, eligible_ids)
        record_ids = [str(i) for i in eligible_ids]
    op = DataOperation(
        reference=ref, tenant_id=tenant_id, tenant_name=tenant.name, module=module, operation=operation, status="Prepared", filters=filters, selection={k: v for k, v in selection.items() if k != "ids"} | ({"ids_count": len(selection.get("ids") or [])} if selection.get("mode") == "ids" else {}),
        record_ids=[str(i) for i in record_ids], versions=versions, analysis=analysis, payload=payload, plan_hash="pending", approval_required=approval_needed(operation, module, len(eligible_ids), payload),
        requested_by=admin.id, requested_by_name=_name(admin), expires_at=now + PLAN_TTL)
    op.plan_hash = plan_fingerprint(op)
    db.add(op)
    await db.commit()
    return dump(op, full=True)


async def submit(db: AsyncSession, admin: User, op_id: uuid.UUID, reason: str, attest_test_data: bool = False) -> dict:
    perms.require(admin, perms.REQUEST)
    op = await _get(db, op_id, lock=True)
    if op.requested_by != admin.id:
        raise ForbiddenError("Only the administrator who prepared this plan can submit it")
    if op.status != "Prepared":
        raise ConflictError(f"This plan is already {op.status}")
    now = datetime.now(UTC)
    if op.expires_at <= now:
        op.status = "Expired"
        await db.commit()
        raise ConflictError("This preview has expired. Prepare it again so it reflects the data as it is now.")
    if len((reason or "").strip()) < 10:
        raise ValidationError("Give a reason of at least 10 characters")
    if op.analysis["summary"]["eligible"] < 1:
        raise ValidationError("Nothing in this selection is eligible, so there is nothing to request")
    if op.operation == "clean_test":
        if not attest_test_data:
            raise ValidationError("Confirm that you have reviewed these records and they are test data")
        op.payload = {**op.payload, "attested_test_data": True}
    op.reason = reason.strip()
    op.submitted_at = now
    if op.approval_required:
        op.status, op.expires_at = "PendingApproval", now + DECISION_WINDOW
    else:
        op.status, op.expires_at = "Approved", now + EXECUTE_WINDOW
    op.plan_hash = plan_fingerprint(op)
    await _event(db, op, admin, "submitted", op.reason)
    await db.commit()
    return dump(op, full=True)


async def decide(db: AsyncSession, admin: User, op_id: uuid.UUID, approve: bool, note: str | None) -> dict:
    perms.require(admin, perms.APPROVE)
    op = await _get(db, op_id, lock=True)
    if op.status != "PendingApproval":
        raise ConflictError(f"This request is {op.status}, not waiting for a decision")
    if op.requested_by == admin.id:
        raise ForbiddenError("You cannot decide your own request: another administrator must")
    now = datetime.now(UTC)
    if op.expires_at <= now:
        op.status = "Expired"
        await db.commit()
        raise ConflictError("This request expired before it was decided")
    if op.plan_hash != plan_fingerprint(op):
        raise ConflictError("This plan was changed after it was submitted. It must be prepared and submitted again.")
    if not approve and len((note or "").strip()) < 3:
        raise ValidationError("Say why you are rejecting it")
    op.status = "Approved" if approve else "Rejected"
    op.decided_by, op.decided_by_name, op.decided_at, op.decision_note = admin.id, _name(admin), now, (note or "").strip() or None
    if approve:
        op.expires_at = now + EXECUTE_WINDOW
    await _event(db, op, admin, "approved" if approve else "rejected", op.decision_note)
    await db.commit()
    return dump(op, full=True)


async def cancel(db: AsyncSession, admin: User, op_id: uuid.UUID) -> dict:
    op = await _get(db, op_id, lock=True)
    if op.requested_by != admin.id and not perms.has(admin, perms.APPROVE):
        raise ForbiddenError("Only the requester or an approver can cancel a plan")
    if op.status not in ("Prepared", "PendingApproval", "Approved"):
        raise ConflictError(f"A {op.status} operation cannot be cancelled")
    op.status = "Cancelled"
    await _event(db, op, admin, "cancelled")
    await db.commit()
    return dump(op, full=True)


def _confirmed(op: DataOperation, confirm: dict | None) -> bool:
    c = confirm or {}
    return (c.get("business_name", "").strip().casefold() == op.tenant_name.strip().casefold() and c.get("reference", "").strip().upper() == op.reference)


async def execute(db: AsyncSession, admin: User, op_id: uuid.UUID, idempotency_key: str | None, confirm: dict | None) -> dict:
    perms.require(admin, perms.EXECUTE)
    op = await _get(db, op_id, lock=True)
    if op.status in ("Completed", "PartiallyCompleted", "Failed"):
        return {**dump(op, full=True), "replayed": True}  # running it twice does nothing the second time
    if op.status == "Executing":
        raise ConflictError("This operation is already running")
    if op.status != "Approved":
        raise ConflictError(f"This operation is {op.status}: it can only run once approved")
    now = datetime.now(UTC)
    if op.expires_at <= now:
        op.status = "Expired"
        await _event(db, op, admin, "expired")
        await db.commit()
        raise ConflictError("This plan has expired. Prepare it again.")
    if op.plan_hash != plan_fingerprint(op):
        raise ConflictError("This plan no longer matches what was approved. Prepare and submit it again.")
    if op.operation in (*DESTRUCTIVE, "reset") and not _confirmed(op, confirm):
        raise ValidationError("Type the business name and the operation reference exactly to confirm")
    tenant = await tenant_of(db, op.tenant_id)
    op.status, op.started_at, op.executed_by, op.executed_by_name, op.idempotency_key = "Executing", now, admin.id, _name(admin), (idempotency_key or "")[:64] or None
    await _event(db, op, admin, "started")
    await db.commit()
    label = f"{_name(admin)} (platform)"

    if op.operation == "reset":
        try:
            result = await opening.execute_close(db, tenant, admin, date.fromisoformat(op.payload["closing_date"]), f"{op.reason} (data operation {op.reference})", label)
            op.status, op.affected_count, op.result = "Completed", 1, result
        except Exception as exc:  # noqa: BLE001 - recorded on the operation; the books were not changed
            await db.rollback()
            op = await _get(db, op_id, lock=True)
            op.status, op.result = "Failed", {"error": getattr(exc, "message", None) or str(exc)}
        op.finished_at = datetime.now(UTC)
        await _event(db, op, admin, op.status.lower())
        await db.commit()
        return dump(op, full=True)

    # Plain copies of everything the loop needs: a rollback after one failed record expires every loaded object, and touching an expired one in async code raises.
    operation, module, payload, reason, reference, versions = op.operation, op.module, dict(op.payload), op.reason or "", op.reference, dict(op.versions)
    admin_id, tenant_id = admin.id, tenant.id
    spec = spec_for(module)
    ids = [uuid.UUID(i) for i in op.record_ids]
    current = await assess(db, tenant, module, operation, ids, payload)  # again, from scratch
    eligible_now = {a.id for a in current if a.eligible}
    versions_now = await _versions(db, spec, ids)
    snapshots = await rows_for(db, tenant.id, module, ids) if operation in DESTRUCTIVE else {}
    counts = {"affected": 0, "blocked": 0, "failed": 0, "skipped": 0}
    by_id: dict[uuid.UUID, Assessment] = {a.id: a for a in current}
    for rid in ids:
        label_text = by_id[rid].label if rid in by_id else str(rid)
        if rid not in eligible_now:
            outcome, message = "blocked", "; ".join(by_id[rid].reasons) if rid in by_id else "No longer exists"
        elif versions and versions_now.get(str(rid)) != versions.get(str(rid)):
            outcome, message = "skipped", "Changed since the preview, so it was left alone. Prepare a new plan to include it."
        else:
            try:
                message = await run_one(db, tenant, admin, module, operation, rid, payload, reason, reference)
                outcome = "affected"
            except Exception as exc:  # noqa: BLE001 - one record failing must not stop the others
                await db.rollback()
                outcome, message = "failed", getattr(exc, "message", None) or str(exc)
                admin = await db.get(User, admin_id, populate_existing=True)
                tenant = await tenant_of(db, tenant_id)
        counts[outcome] += 1
        snap = snapshots.get(rid, {}).get("_plain") if outcome == "affected" else None
        db.add(DataOperationItem(operation_id=op_id, record_id=rid, label=label_text[:255], outcome=outcome, message=message, snapshot=snap, created_at=datetime.now(UTC)))
        await db.commit()
    op = await _get(db, op_id, lock=True)
    op.affected_count, op.finished_at = counts["affected"], datetime.now(UTC)
    op.result = {"counts": counts, "total": len(ids)}
    op.status = "Completed" if counts["affected"] == len(ids) else "Failed" if counts["affected"] == 0 else "PartiallyCompleted"
    await _event(db, op, admin, op.status.lower(), f"{counts['affected']} of {len(ids)} records")
    await db.commit()
    return dump(op, full=True)


async def get(db: AsyncSession, op_id: uuid.UUID) -> dict:
    return dump(await _get(db, op_id), full=True)


async def items(db: AsyncSession, op_id: uuid.UUID, outcome: str | None, offset: int, limit: int) -> tuple[list[dict], int]:
    stmt = select(DataOperationItem).where(DataOperationItem.operation_id == op_id)
    if outcome:
        stmt = stmt.where(DataOperationItem.outcome == outcome)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(DataOperationItem.created_at, DataOperationItem.record_id).offset(offset).limit(limit))).scalars().all()
    return [{"record_id": str(r.record_id), "label": r.label, "outcome": r.outcome, "message": r.message, "snapshot": r.snapshot, "at": r.created_at} for r in rows], total


async def history(db: AsyncSession, *, tenant_id: uuid.UUID | None, module: str | None, operation: str | None, status: str | None, requested_by: uuid.UUID | None,
                  start: date | None, end: date | None, include_drafts: bool, offset: int, limit: int) -> tuple[list[dict], int]:
    stmt = select(DataOperation)
    if tenant_id:
        stmt = stmt.where(DataOperation.tenant_id == tenant_id)
    if module:
        stmt = stmt.where(DataOperation.module == module)
    if operation:
        stmt = stmt.where(DataOperation.operation == operation)
    if status:
        stmt = stmt.where(DataOperation.status == status)
    elif not include_drafts:
        stmt = stmt.where(DataOperation.submitted_at.is_not(None))  # a preview nobody submitted is not history
    if requested_by:
        stmt = stmt.where(DataOperation.requested_by == requested_by)
    if start:
        stmt = stmt.where(DataOperation.created_at >= datetime.combine(start, datetime.min.time(), UTC))
    if end:
        stmt = stmt.where(DataOperation.created_at < datetime.combine(end + timedelta(days=1), datetime.min.time(), UTC))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(DataOperation.created_at.desc()).offset(offset).limit(limit))).scalars().all()
    return [dump(r) for r in rows], total
