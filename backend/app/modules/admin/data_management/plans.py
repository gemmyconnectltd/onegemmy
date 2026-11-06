"""The life of a data operation: prepare, submit, approve, execute.

Prepare changes nothing: it fixes the exact records, runs the impact analysis and stores the plan with an expiry. Submit asks for the
decision. Execute re-checks everything from scratch (permission, business, eligibility, record versions, plan integrity, expiry) and then
does the records one at a time through their own services. Nothing is assumed to be undoable: each record has its own outcome.
"""
import asyncio
import hashlib
import json
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.exceptions import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.modules.admin.data_management import opening, reset
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
from app.modules.admin.models import TenantExport
from app.modules.audit.service import record_audit
from app.modules.currency.models import PlatformSetting
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
    "reset_data": ["Permanent. The records of every group that is not kept are deleted for good, in dependency order, in one transaction: if anything fails, nothing is deleted.",
                   "A complete copy is stored first, and the reset does not start if that copy cannot be made. There is no automatic restore from it.",
                   "Users, branches, settings, subscription and billing history, the audit log and this operation history are never deleted."],
    "reset": ["The books are locked through the closing date. Nothing is deleted or re-posted. The business can reopen the period with a reason."],
}


SECOND_APPROVER_KEY = "dataOps.requireSecondApprover"
BATCH_MAX = 25


async def second_approver_required(db: AsyncSession) -> bool:
    """Platform setting, off unless an administrator switched it on: may the person who requested an operation also approve it?"""
    row = await db.get(PlatformSetting, SECOND_APPROVER_KEY)
    return bool(row.value.get("enabled")) if row is not None and isinstance(row.value, dict) else False


async def set_second_approver_required(db: AsyncSession, admin: User, enabled: bool) -> bool:
    row = await db.get(PlatformSetting, SECOND_APPROVER_KEY)
    before = bool(row.value.get("enabled")) if row is not None and isinstance(row.value, dict) else False
    if row is None:
        db.add(PlatformSetting(key=SECOND_APPROVER_KEY, value={"enabled": enabled}, updated_by=admin.id))
    else:
        row.value, row.updated_by = {"enabled": enabled}, admin.id
    await record_audit(db, tenant_id=None, actor_user_id=admin.id, actor_name=f"{_name(admin)} (platform)", action="data_management.second_approver_setting", entity_type="platform_setting",
                       entity_id=SECOND_APPROVER_KEY, summary=f"Second approver for data operations {'required' if enabled else 'not required'}", changes={"before": before, "after": enabled})
    await db.commit()
    return enabled


def _hash(plan: dict) -> str:
    return hashlib.sha256(json.dumps(plan, sort_keys=True, default=str).encode()).hexdigest()


def plan_fingerprint(op: DataOperation) -> str:
    return _hash({"tenant": str(op.tenant_id), "module": op.module, "operation": op.operation, "ids": sorted(op.record_ids), "versions": op.versions, "payload": op.payload})


def approval_needed(operation: str, module: str, eligible: int, payload: dict) -> bool:
    if operation in (*DESTRUCTIVE, "reset", "reset_data"):
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
        "decided_by": op.decided_by_name, "self_approved": op.self_approved, "decision_note": op.decision_note, "decided_at": op.decided_at, "executed_by": op.executed_by_name, "created_at": op.created_at,
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


async def _event(db: AsyncSession, op: DataOperation, admin: User | None, action: str, note: str | None = None, extra: dict | None = None, summary: str | None = None) -> None:
    """Every state change is also written to the append-only audit log, on the business's own trail and attributed to the platform administrator."""
    await record_audit(db, tenant_id=op.tenant_id, actor_user_id=admin.id if admin else None, actor_name=f"{_name(admin)} (platform)" if admin else "system", action=f"data_operation.{action}",
                       entity_type="data_operation", entity_id=str(op.id), summary=summary or f"{op.reference}: {op.operation.replace('_', ' ')} {op.module} {action}", changes={"status": op.status, "note": note, **(extra or {})})


async def prepare(
    db: AsyncSession,
    admin: User,
    tenant_id: uuid.UUID,
    module: str,
    operation: str,
    selection: dict | None,
    payload: dict | None,
    *,
    commit: bool = True,
) -> dict:
    perms.require(admin, perms.PREVIEW)
    tenant = await tenant_of(db, tenant_id)
    payload = dict(payload or {})
    now = datetime.now(UTC)
    ref = f"DM-{now.year}-{secrets.token_hex(3).upper()}"
    if operation == "reset_data":
        cfg = reset.parse_config(payload)
        data = await reset.plan(db, tenant, cfg)
        blockers = data["blockers"]
        deleting = data["totals"]["delete"]
        analysis = {"summary": {"selected": deleting, "eligible": 0 if blockers or deleting == 0 else 1, "blocked": len(blockers), "delete": deleting, "kept": data["totals"]["kept"]},
                    "reset": data, "blockers": blockers, "assessments": [], "related": {}, "restrictions": RESTRICTIONS["reset_data"]}
        payload, record_ids, versions, selection, filters = {**cfg.dump()}, [], {}, {"mode": "reset_data"}, {}
        eligible_ids: list[uuid.UUID] = []
    elif operation == "reset":
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
    if commit:
        await db.commit()
    else:
        await db.flush()
    return dump(op, full=True)


async def submit(db: AsyncSession, admin: User, op_id: uuid.UUID, reason: str, attest_test_data: bool = False, attest_owner_request: bool = False) -> dict:
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
    minimum = 20 if op.operation == "reset_data" else 10
    if len((reason or "").strip()) < minimum:
        raise ValidationError(f"Give a reason of at least {minimum} characters")
    if op.operation == "reset_data":
        if op.analysis.get("blockers"):
            raise ValidationError("Resolve the blockers first: keep the groups named in the preview, or delete both sides")
        if op.analysis["summary"].get("delete", 0) < 1:
            raise ValidationError("Nothing would be deleted, so there is nothing to request")
        if not attest_owner_request:
            raise ValidationError("Confirm that you have the business owner's written request")
        op.payload = {**op.payload, "owner_request_confirmed": True}
    elif op.analysis["summary"]["eligible"] < 1:
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
    self_decision = op.requested_by == admin.id
    if self_decision and not approve:
        raise ForbiddenError("You cannot reject your own request: cancel it instead")
    if self_decision and await second_approver_required(db):
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
    op.self_approved = bool(approve and self_decision)
    op.decided_by, op.decided_by_name, op.decided_at, op.decision_note = admin.id, _name(admin), now, (note or "").strip() or None
    if approve:
        op.expires_at = now + EXECUTE_WINDOW
    await _event(db, op, admin, "approved" if approve else "rejected", op.decision_note, {"self_approved": op.self_approved} if approve else None)
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


async def execute(db: AsyncSession, admin: User, op_id: uuid.UUID, idempotency_key: str | None, confirm: dict | None, *, confirmed: bool = False) -> dict:
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
    if op.operation in (*DESTRUCTIVE, "reset", "reset_data") and not confirmed and not _confirmed(op, confirm):
        raise ValidationError("Type the business name and the operation reference exactly to confirm")
    tenant = await tenant_of(db, op.tenant_id)
    if op.operation == "reset_data":
        running = (await db.execute(select(func.count()).select_from(DataOperation).where(DataOperation.tenant_id == op.tenant_id, DataOperation.status == "Executing", DataOperation.id != op.id))).scalar_one()
        if running:
            raise ConflictError("Another Data Management operation is running for this business. Wait for it to finish, then run this again.")
    op.status, op.started_at, op.executed_by, op.executed_by_name, op.idempotency_key = "Executing", now, admin.id, _name(admin), (idempotency_key or "")[:64] or None
    await _event(db, op, admin, "started")
    await db.commit()
    if op.operation == "reset_data":
        await _launch(op_id, admin.id)
        return dump(await _get(db, op_id), full=True)
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


async def approve_and_run(db: AsyncSession, admin: User, op_id: uuid.UUID, *, reason: str, attest_test_data: bool, idempotency_key: str | None, confirm: dict | None, batch_confirmed: bool = False,
                          attest_owner_request: bool = False) -> dict:
    """Submit (if still a preview), approve and run in one step. Every check of the separate steps still applies, and the plan is assessed again from scratch before it runs.
    The administrator who requested it may approve it only while the platform does not require a second approver."""
    perms.require(admin, perms.APPROVE)
    perms.require(admin, perms.EXECUTE)
    op = await _get(db, op_id)
    if op.status not in ("Prepared", "PendingApproval", "Approved"):
        raise ConflictError(f"This operation is {op.status}: it cannot be approved and run")
    mine = op.requested_by == admin.id
    if op.status == "Prepared" and not mine:
        raise ForbiddenError("Only the administrator who prepared this plan can approve and run it")
    if op.status != "Approved" and op.approval_required and mine and await second_approver_required(db):
        raise ForbiddenError("This platform requires another administrator to approve. Use Request approval.")
    if not batch_confirmed and not _confirmed(op, confirm):
        raise ValidationError("Type the business name and the operation reference exactly to confirm")
    if op.status == "Prepared":
        await submit(db, admin, op_id, reason, attest_test_data, attest_owner_request)
        op = await _get(db, op_id)
    if op.status == "PendingApproval":
        await decide(db, admin, op_id, True, None)
    return await execute(db, admin, op_id, idempotency_key, confirm, confirmed=True)


async def approve_and_run_batch(db: AsyncSession, admin: User, ids: list[uuid.UUID], phrase: str) -> list[dict]:
    """Approve and run several operations that are waiting for approval, after one typed confirmation for the whole batch. Each runs on its own: one failing does not stop the rest."""
    perms.require(admin, perms.APPROVE)
    perms.require(admin, perms.EXECUTE)
    ids = list(dict.fromkeys(ids))
    if not 1 <= len(ids) <= BATCH_MAX:
        raise ValidationError(f"Choose between 1 and {BATCH_MAX} operations")
    if (phrase or "").strip().upper() != f"RUN {len(ids)}":
        raise ValidationError(f"Type RUN {len(ids)} to confirm")
    for oid in ids:
        op = await _get(db, oid)
        if op.status != "PendingApproval":
            raise ConflictError(f"{op.reference} is {op.status}, not waiting for approval")
    admin_id = admin.id
    results: list[dict] = []
    for oid in ids:
        reference = (await _get(db, oid)).reference
        try:
            done = await approve_and_run(db, admin, oid, reason="", attest_test_data=False, idempotency_key=secrets.token_hex(16), confirm=None, batch_confirmed=True)
            results.append({"id": str(oid), "reference": reference, "status": done["status"], "affected": done["affected"], "error": None})
        except AppError as exc:
            await db.rollback()
            admin = await db.get(User, admin_id, populate_existing=True)
            results.append({"id": str(oid), "reference": reference, "status": "NotRun", "affected": 0, "error": exc.detail})
    return results


# ── Reset Business Data: runs in the background, one transaction for the deletes ──────────────────────────────

RUN_INLINE = False  # tests run the job inside the request so they can look at the outcome
_TASKS: set[asyncio.Task] = set()


@asynccontextmanager
async def session_scope():
    async with AsyncSessionLocal() as session:
        yield session


progress_scope = session_scope


async def _progress(op_id: uuid.UUID, data: dict) -> None:
    """Where the job has got to, written on its own short transaction so the page can show it while the deletes are still open."""
    async with progress_scope() as db:
        op = await _get(db, op_id)
        op.result = {**(op.result or {}), "progress": data}
        await db.commit()


async def _launch(op_id: uuid.UUID, admin_id: uuid.UUID) -> None:
    if RUN_INLINE:
        await _reset_job(op_id, admin_id)
        return
    task = asyncio.get_running_loop().create_task(_reset_job(op_id, admin_id))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


async def _fail(op_id: uuid.UUID, admin_id: uuid.UUID, stage: str, exc: BaseException, extra: dict | None = None) -> None:
    async with session_scope() as db:
        await db.rollback()
        op = await _get(db, op_id, lock=True)
        admin = await db.get(User, admin_id)
        message = getattr(exc, "detail", None) or str(exc) or exc.__class__.__name__
        op.status, op.finished_at = "Failed", datetime.now(UTC)
        op.result = {"error": message, "stage": stage, "nothing_deleted": True, **(extra or {})}
        await _event(db, op, admin, "failed", message, {"stage": stage, "nothing_deleted": True}, summary=f"{op.reference}: Reset Business Data failed ({stage}); nothing was deleted")
        await db.commit()


async def _reset_job(op_id: uuid.UUID, admin_id: uuid.UUID) -> None:
    started = time.monotonic()
    async with session_scope() as db:
        op = await _get(db, op_id)
        tenant = await tenant_of(db, op.tenant_id)
        cfg = reset.parse_config(op.payload)
        tenant_id, reference, requested_by, decided_by, self_approved, reason = tenant.id, op.reference, op.requested_by_name, op.decided_by_name, op.self_approved, op.reason
    # 1. A complete copy first. If it cannot be made, nothing is deleted.
    export_id = uuid.uuid4()
    try:
        await _progress(op_id, {"stage": "export"})
        async with session_scope() as db:
            tenant = await tenant_of(db, tenant_id)
            stored = await reset.export_all(db, tenant, cfg, export_id)
            db.add(TenantExport(id=export_id, tenant_id=tenant_id, requested_by=admin_id, categories=["reset_backup"], fmt="zip", expires_at=datetime.now(UTC) + timedelta(days=3650),
                                file_path=stored["path"], file_sha256=stored["sha256"], file_bytes=stored["bytes"]))
            await db.commit()
    except Exception as exc:  # noqa: BLE001 - reported on the operation; nothing has been deleted
        await _fail(op_id, admin_id, "export", exc)
        return
    # 2. The deletes: one transaction, all or nothing.
    try:
        async with session_scope() as db:
            tenant = await tenant_of(db, tenant_id)
            fresh = await reset.plan(db, tenant, cfg)
            if fresh["blockers"]:
                raise ConflictError("The data changed since the preview and a blocker appeared: " + fresh["blockers"][0]["message"])

            async def progress(data: dict) -> None:
                await _progress(op_id, data)

            counts = await reset.delete_data(db, tenant, cfg, progress)
            op = await _get(db, op_id, lock=True)
            admin = await db.get(User, admin_id)
            kept = {g["key"]: g["kept"] for g in fresh["groups"]}
            deleted_total = sum(counts.values())
            labels = {g.key: g.label for g in reset.GROUPS}
            op.status, op.finished_at, op.affected_count = "Completed", datetime.now(UTC), deleted_total
            op.result = {"counts": counts, "total": deleted_total, "kept": kept, "export_id": str(export_id), "export_bytes": stored["bytes"], "export_sha256": stored["sha256"],
                         "duration_seconds": round(time.monotonic() - started, 2), "config": cfg.dump(), "labels": labels, "groups": fresh["groups"], "notes": fresh["notes"]}
            await _event(db, op, admin, "completed", f"{deleted_total} records deleted", {
                "requested_by": requested_by, "approved_by": decided_by, "self_approved": self_approved, "reason": reason, "kept_groups": sorted(cfg.keep), "date_from": cfg.date_from.isoformat() if cfg.date_from else None,
                "date_to": cfg.date_to.isoformat() if cfg.date_to else None, "deleted": counts, "export_id": str(export_id)}, summary=f"{reference}: Reset Business Data completed")
            await db.commit()
    except Exception as exc:  # noqa: BLE001 - the transaction rolls back as a whole
        await _fail(op_id, admin_id, "delete", exc, {"export_id": str(export_id)})


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
