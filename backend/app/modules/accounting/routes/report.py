import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.accounting import service
from app.modules.accounting.service.workspace import allow, resolve_branch

router = APIRouter(tags=["Accounting - Reports"])

DateQ = Annotated[date | None, Query()]


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/accounting/reports/trial-balance")
async def trial_balance(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId, from_date: DateQ = None, to_date: DateQ = None):
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    report = await service.trial_balance(db, current_user.tenant_id, from_date, to_date, branch_id)
    return success_response(data=report.model_dump(), message="Trial balance generated")


@router.get("/accounting/reports/income-statement")
async def income_statement(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId, from_date: DateQ = None, to_date: DateQ = None):
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    report = await service.income_statement(db, current_user.tenant_id, from_date, to_date, branch_id)
    return success_response(data=report.model_dump(), message="Income statement generated")


@router.get("/accounting/reports/balance-sheet")
async def balance_sheet(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId, as_of: Annotated[date | None, Query()] = None):
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    report = await service.balance_sheet(db, current_user.tenant_id, as_of or datetime.now(UTC).date(), branch_id)
    return success_response(data=report.model_dump(), message="Balance sheet generated")


@router.get("/accounting/reports/cash-flow")
async def cash_flow(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId, from_date: DateQ = None, to_date: DateQ = None):
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    report = await service.cash_flow(db, current_user.tenant_id, from_date, to_date, branch_id)
    return success_response(data=report.model_dump(), message="Cash flow statement generated")


@router.get("/accounting/reports/general-ledger")
async def general_ledger(
    db: DbSession,
    current_user: CurrentUser, branch_id: ActiveBranchId,
    page: PageQuery,
    account_id: Annotated[uuid.UUID | None, Query()] = None,
    from_date: DateQ = None,
    to_date: DateQ = None,
):
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    report = await service.general_ledger(db, current_user.tenant_id, from_date, to_date, account_id, branch_id, page.offset, min(page.limit, 100))
    return success_response(data=report.model_dump(), message="General ledger generated")


@router.get("/accounting/reports/receivables")
async def receivables_summary(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    allow(current_user, "accounts_receivable")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    summary = await service.get_receivables_summary(db, current_user.tenant_id, branch_id)
    return success_response(data=summary, message="Receivables summary generated")


STATEMENTS = ("trial-balance", "income-statement", "balance-sheet", "cash-flow", "general-ledger")


@router.get("/accounting/reports/{statement}/export")
async def export_accounting_report(
    db: DbSession,
    current_user: CurrentUser, branch_id: ActiveBranchId,
    statement: str,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: DateQ = None,
    to_date: DateQ = None,
    as_of: Annotated[date | None, Query()] = None,
    account_id: Annotated[uuid.UUID | None, Query()] = None,
):
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    if statement not in STATEMENTS:
        raise ValidationError(f"Unknown statement: {statement}")
    import os

    from fastapi.responses import FileResponse
    from starlette.background import BackgroundTask

    from app.modules.accounting.schemas.workspace import ReportRequest
    from app.modules.accounting.service.workspace import generate
    from app.modules.accounting.service.workspace_export import export_snapshot
    snapshot = await generate(db, current_user, ReportRequest(kind=statement, from_date=from_date, to_date=to_date, as_of=as_of, account_id=account_id), branch_id)
    path, filename, media_type = await export_snapshot(db, current_user, uuid.UUID(snapshot["id"]), format)
    return FileResponse(path, filename=filename, media_type=media_type, background=BackgroundTask(os.unlink, path))
