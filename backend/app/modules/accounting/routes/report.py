import uuid
from datetime import UTC, date, datetime
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Query, Response

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.response import success_response
from app.modules.accounting import service

router = APIRouter(tags=["Accounting - Reports"])

DateQ = Annotated[date | None, Query()]


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/accounting/reports/trial-balance")
async def trial_balance(db: DbSession, current_user: CurrentUser, from_date: DateQ = None, to_date: DateQ = None):
    _require_tenant(current_user.tenant_id)
    report = await service.trial_balance(db, current_user.tenant_id, from_date, to_date)
    return success_response(data=report.model_dump(), message="Trial balance generated")


@router.get("/accounting/reports/income-statement")
async def income_statement(db: DbSession, current_user: CurrentUser, from_date: DateQ = None, to_date: DateQ = None):
    _require_tenant(current_user.tenant_id)
    report = await service.income_statement(db, current_user.tenant_id, from_date, to_date)
    return success_response(data=report.model_dump(), message="Income statement generated")


@router.get("/accounting/reports/balance-sheet")
async def balance_sheet(db: DbSession, current_user: CurrentUser, as_of: Annotated[date | None, Query()] = None):
    _require_tenant(current_user.tenant_id)
    report = await service.balance_sheet(db, current_user.tenant_id, as_of or datetime.now(UTC).date())
    return success_response(data=report.model_dump(), message="Balance sheet generated")


@router.get("/accounting/reports/cash-flow")
async def cash_flow(db: DbSession, current_user: CurrentUser, from_date: DateQ = None, to_date: DateQ = None):
    _require_tenant(current_user.tenant_id)
    report = await service.cash_flow(db, current_user.tenant_id, from_date, to_date)
    return success_response(data=report.model_dump(), message="Cash flow statement generated")


@router.get("/accounting/reports/general-ledger")
async def general_ledger(
    db: DbSession,
    current_user: CurrentUser,
    account_id: Annotated[uuid.UUID | None, Query()] = None,
    from_date: DateQ = None,
    to_date: DateQ = None,
):
    _require_tenant(current_user.tenant_id)
    report = await service.general_ledger(db, current_user.tenant_id, from_date, to_date, account_id)
    return success_response(data=report.model_dump(), message="General ledger generated")


STATEMENTS = ("trial-balance", "income-statement", "balance-sheet", "cash-flow", "general-ledger")


@router.get("/accounting/reports/{statement}/export")
async def export_accounting_report(
    db: DbSession,
    current_user: CurrentUser,
    statement: str,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: DateQ = None,
    to_date: DateQ = None,
    as_of: Annotated[date | None, Query()] = None,
    account_id: Annotated[uuid.UUID | None, Query()] = None,
):
    _require_tenant(current_user.tenant_id)
    if statement not in STATEMENTS:
        raise ValidationError(f"Unknown statement: {statement}")
    filename, content, media_type = await service.export_accounting_statement(
        db, current_user.tenant_id, statement, format, from_date, to_date, as_of, account_id
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
