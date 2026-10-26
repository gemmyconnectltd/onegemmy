"""Thin HTTP adapters for the tenant debt workspace."""

import os
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.accounting.schemas.debt import (
    DebtEditRequest,
    DebtFilters,
    DebtKind,
    DebtPaymentRequest,
    DebtReasonRequest,
    DebtReminderRequest,
    ManualDebtRequest,
    PayableReceiptRequest,
    StatementSendRequest,
)
from app.modules.accounting.service import debt, debt_actions, debt_notify
from app.modules.accounting.service.debt_export import export_list, export_statement
from app.modules.accounting.service.debt_statement import statement as build_statement

router = APIRouter(prefix="/debts", tags=["Debt Management"])


@router.get("/overview")
async def overview(db: DbSession, current_user: CurrentUser, branch: ActiveBranchId) -> dict:
    return success_response(await debt.overview(db, current_user, branch))


@router.post("/{kind}/search")
async def records(
    kind: DebtKind,
    db: DbSession,
    current_user: CurrentUser,
    branch: ActiveBranchId,
    page: PageQuery,
    filters: DebtFilters,
) -> dict:
    return success_response(
        await debt.records(
            db,
            current_user,
            kind,
            branch,
            filters,
            page.page,
            min(page.page_size, 50),
        )
    )


@router.get("/payable/purchases")
async def draft_purchases(db: DbSession, current_user: CurrentUser,
                          branch: ActiveBranchId, page: PageQuery) -> dict:
    return success_response(await debt.draft_purchases(
        db, current_user, branch, page.page, min(page.page_size, 25),
    ))


@router.post("/payable/purchases/{purchase_id}/receive")
async def receive_payable(purchase_id: uuid.UUID, data: PayableReceiptRequest,
                          db: DbSession, current_user: CurrentUser,
                          branch: ActiveBranchId) -> dict:
    return success_response(await debt.receive_payable(
        db, current_user, branch, purchase_id, data.due_date,
    ), message="Supplier payable created")


@router.get("/{kind}/statement")
async def statement(kind: DebtKind, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, party_id: uuid.UUID,
                    date_from: date | None = None, date_to: date | None = None) -> dict:
    return success_response(await build_statement(db, current_user, kind, branch, party_id, date_from, date_to))


@router.get("/{kind}/statement/export")
async def statement_export(kind: DebtKind, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, party_id: uuid.UUID,
                           format: Literal["pdf", "xlsx"] = "pdf", date_from: date | None = None, date_to: date | None = None):
    path, filename, media = await export_statement(db, current_user, kind, branch, party_id, date_from, date_to, format)
    return FileResponse(path, filename=filename, media_type=media, background=BackgroundTask(os.unlink, path))


@router.post("/{kind}/export")
async def export(kind: DebtKind, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, filters: DebtFilters,
                 format: Literal["pdf", "xlsx", "csv"] = "xlsx", ids: list[uuid.UUID] | None = Query(None)):
    path, filename, media = await export_list(db, current_user, kind, branch, filters, format, ids)
    return FileResponse(path, filename=filename, media_type=media, background=BackgroundTask(os.unlink, path))


@router.post("/{kind}/manual")
async def create_manual(kind: DebtKind, data: ManualDebtRequest, db: DbSession, current_user: CurrentUser,
                        branch: ActiveBranchId) -> dict:
    return success_response(await debt_actions.create_manual(db, current_user, kind, branch, data), message="Opening balance recorded")


@router.post("/receivable/remind")
async def remind(data: DebtReminderRequest, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId) -> dict:
    return success_response(await debt_notify.remind(db, current_user, branch, data.ids, data.message))


@router.post("/receivable/statement/send")
async def send_statement(data: StatementSendRequest, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId) -> dict:
    return success_response(await debt_notify.send_statement(db, current_user, branch, data.party_id, data.date_from, data.date_to),
                            message="Statement sent")


@router.patch("/{kind}/{document_id}")
async def edit(kind: DebtKind, document_id: uuid.UUID, data: DebtEditRequest, db: DbSession, current_user: CurrentUser,
               branch: ActiveBranchId) -> dict:
    return success_response(await debt_actions.edit(db, current_user, kind, document_id, branch, data), message="Debt updated")


@router.post("/{kind}/{document_id}/write-off")
async def write_off(kind: DebtKind, document_id: uuid.UUID, data: DebtReasonRequest, db: DbSession, current_user: CurrentUser,
                    branch: ActiveBranchId) -> dict:
    return success_response(await debt_actions.write_off(db, current_user, kind, document_id, branch, data.reason), message="Debt written off")


@router.delete("/{kind}/{document_id}")
async def void(kind: DebtKind, document_id: uuid.UUID, data: DebtReasonRequest, db: DbSession, current_user: CurrentUser,
               branch: ActiveBranchId) -> dict:
    return success_response(await debt_actions.void(db, current_user, kind, document_id, branch, data.reason), message="Debt voided")


@router.get("/{kind}/{document_id}")
async def detail(
    kind: DebtKind,
    document_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    branch: ActiveBranchId,
    payment_page: int = Query(1, ge=1),
) -> dict:
    return success_response(
        await debt.detail(db, current_user, kind, document_id, branch, payment_page)
    )


@router.post("/{kind}/{document_id}/payments")
async def pay(
    kind: DebtKind,
    document_id: uuid.UUID,
    data: DebtPaymentRequest,
    db: DbSession,
    current_user: CurrentUser,
    branch: ActiveBranchId,
) -> dict:
    return success_response(
        await debt.pay(db, current_user, kind, document_id, branch, data),
        message="Payment recorded successfully",
    )
