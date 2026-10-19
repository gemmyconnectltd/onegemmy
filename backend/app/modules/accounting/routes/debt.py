"""Thin HTTP adapters for the tenant debt workspace."""

import uuid

from fastapi import APIRouter, Query

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.accounting.schemas.debt import (
    DebtFilters,
    DebtKind,
    DebtPaymentRequest,
    PayableReceiptRequest,
)
from app.modules.accounting.service import debt

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
