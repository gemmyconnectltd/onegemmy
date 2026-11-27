"""Super-admin: emails that never reached people (refused or bounced), and following them up."""
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import EmailStr, Field
from sqlalchemy import func, select

from app.core.deps import DbSession, SuperUser
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.admin import email_problems as problems
from app.modules.admin.lifecycle import actor_name
from app.modules.audit.service import record_audit
from app.modules.tenants.models import User
from app.shared.schemas import TrimmedModel

router = APIRouter(prefix="/admin/email-problems", tags=["Super Admin"])


class ResolveRequest(TrimmedModel):
    note: str = Field(default="", max_length=1000)


class CorrectEmailRequest(TrimmedModel):
    email: EmailStr
    resend: bool = True
    note: str = Field(default="", max_length=1000)


async def _get(db, problem_id: uuid.UUID):
    found = await problems.load(db, problem_id)
    if not found:
        raise NotFoundError("Email problem not found")
    return found


async def _audit(db, admin: User, problem, action: str, summary: str, changes: dict | None = None):
    await record_audit(db, tenant_id=None, actor_user_id=admin.id, actor_name=actor_name(admin), action=action,
                       entity_type="email_problem", entity_id=str(problem.id), summary=summary, changes=changes)


def _settle(problem, admin: User, resolution: str) -> None:
    problem.status, problem.resolved_at, problem.resolved_by, problem.resolution = "resolved", datetime.now(UTC), admin.id, resolution


@router.get("")
async def list_email_problems(db: DbSession, _: SuperUser, page_params: PageQuery,
                              status: Literal["open", "resolved", "all"] = "open",
                              reason: Literal["no_such_address", "domain_not_found", "mailbox_full", "blocked", "not_sent", "other"] | None = None,
                              q: str | None = None):
    items, total = await problems.list_problems(db, status=status, reason=reason, q=q, page=page_params.page, page_size=page_params.page_size)
    return paginated_response(items=items, total=total, page=page_params.page, page_size=page_params.page_size, message="Email problems retrieved")


@router.get("/summary")
async def email_problems_summary(db: DbSession, _: SuperUser):
    return success_response(data=await problems.summary(db))


@router.post("/check")
async def check_now(db: DbSession, _: SuperUser):
    """Reads the sending mailboxes for bounce notices right now instead of waiting for the next automatic check."""
    if not problems.enabled():
        raise ValidationError("Reading bounce notices is off: no sending mailbox is set up, or EMAIL_BOUNCE_SYNC is false.")
    added = await problems.sync_bounces()
    return success_response(data={"added": added, "check": problems.check_status()},
                            message=f"{added} new email problem{'s' if added != 1 else ''} found" if added else "No new bounced emails")


@router.post("/{problem_id}/resolve")
async def resolve(problem_id: uuid.UUID, db: DbSession, admin: SuperUser, data: ResolveRequest):
    problem, _, _ = await _get(db, problem_id)
    _settle(problem, admin, data.note or "Marked as followed up")
    await _audit(db, admin, problem, "email_problem.resolve", f"Email problem for {problem.recipient} marked as followed up", {"note": data.note or None})
    await db.commit()
    return success_response(message="Marked as followed up")


@router.post("/{problem_id}/reopen")
async def reopen(problem_id: uuid.UUID, db: DbSession, admin: SuperUser):
    problem, _, _ = await _get(db, problem_id)
    problem.status, problem.resolved_at, problem.resolved_by, problem.resolution = "open", None, None, None
    await _audit(db, admin, problem, "email_problem.reopen", f"Email problem for {problem.recipient} reopened")
    await db.commit()
    return success_response(message="Reopened")


@router.post("/{problem_id}/resend")
async def resend_same_address(problem_id: uuid.UUID, db: DbSession, admin: SuperUser):
    """Sends it again to the same address (e.g. the mailbox was full and has been emptied)."""
    problem, user, tenant = await _get(db, problem_id)
    if problem.kind not in problems.RESENDABLE or user is None:
        raise ValidationError("This email can't be resent from here.")
    if not await problems.resend(db, problem, user, tenant, user.email):
        raise ValidationError("The mail server didn't accept it this time either. It's on the list again.")
    _settle(problem, admin, f"Resent to {user.email}")
    await _audit(db, admin, problem, "email_problem.resend", f"Resent '{problem.subject}' to {user.email}")
    await db.commit()
    return success_response(message=f"Sent again to {user.email}")


@router.post("/{problem_id}/correct-email")
async def correct_email(problem_id: uuid.UUID, db: DbSession, admin: SuperUser, data: CorrectEmailRequest):
    """The person gave the wrong address: change their sign-in email to the right one, and send the mail again there."""
    problem, user, tenant = await _get(db, problem_id)
    if user is None:
        raise ValidationError("No Pesaa user has this address, so there is no email to correct.")
    new = str(data.email).strip().lower()
    old = user.email
    if new == old.lower():
        raise ValidationError("That's the address that failed. Enter the correct one.")
    taken = (await db.execute(select(User.id).where(func.lower(User.email) == new, User.id != user.id))).first()
    if taken:
        raise ConflictError("Another Pesaa user already signs in with that email.")
    user.email = new
    if tenant is not None and tenant.email and tenant.email.lower() == old.lower():
        tenant.email = new  # the business contact email was the same mistyped address
    await _audit(db, admin, problem, "email_problem.correct_email", f"Email for {user.full_name} corrected from {old} to {new}",
                 {"email": {"from": old, "to": new}, "note": data.note or None})
    await db.commit()

    sent = False
    if data.resend and problem.kind in problems.RESENDABLE:
        sent = await problems.resend(db, problem, user, tenant, new)
    resolution = f"Email corrected to {new}" + (" and resent" if sent else "") + (f". {data.note}" if data.note else "")
    _settle(problem, admin, resolution)
    await problems.close_others(db, problem.recipient, admin.id, resolution, problem.id)
    await db.commit()
    tail = " and the email was sent again" if sent else (" — but resending failed; it's on the list again" if data.resend and problem.kind in problems.RESENDABLE else "")
    return success_response(data={"email": new, "resent": sent}, message=f"Email changed to {new}{tail}. They now sign in with {new}.")
