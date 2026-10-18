import os
import uuid
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.accounting.schemas.workspace import (
    AssetAction,
    AssetRequest,
    DueDateRequest,
    FiscalPreference,
    PayrollPosting,
    ReconciliationRequest,
    ReportRequest,
    TransferRequest,
)
from app.modules.accounting.service import dashboard, operations, workspace
from app.modules.accounting.service.workspace_export import export_snapshot

router = APIRouter(prefix="/accounting/workspace", tags=["Accounting workspace"])


@router.get("/overview")
async def overview(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    return success_response(await dashboard.overview(db, current_user, branch_id))


@router.get("/preferences")
async def preferences(db: DbSession, current_user: CurrentUser):
    return success_response(await workspace.preference(db, workspace.allow(current_user, "journal_entries")))


@router.patch("/preferences")
async def update_preferences(data: FiscalPreference, db: DbSession, current_user: CurrentUser):
    from app.modules.accounting.service.catalog import update_preferences as update
    return success_response(await update(db, current_user, data))


@router.post("/reports")
async def generate_report(data: ReportRequest, db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    return success_response(await workspace.generate(db, current_user, data, branch_id), status_code=201)


@router.get("/reports/{snapshot_id}")
async def report_page(snapshot_id: uuid.UUID, db: DbSession, current_user: CurrentUser, page: PageQuery):
    return success_response(await workspace.read_snapshot(db, current_user, snapshot_id, page.page, min(page.page_size, 100)))


@router.get("/reports/{snapshot_id}/export")
async def report_export(snapshot_id: uuid.UUID, db: DbSession, current_user: CurrentUser, format: Literal["pdf", "xlsx", "csv"] = "pdf"):
    path, filename, media = await export_snapshot(db, current_user, snapshot_id, format)
    return FileResponse(path, filename=filename, media_type=media, background=BackgroundTask(os.unlink, path))


@router.get("/records/{view}")
async def records(view: Literal["cash", "reconciliations", "assets", "payroll", "tax", "tax-payments", "pending"], db: DbSession,
                  current_user: CurrentUser, branch_id: ActiveBranchId, page: PageQuery, period: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")):
    return success_response(await dashboard.domain(db, current_user, view, page.page, min(page.page_size, 100), period, branch_id))


@router.post("/transfers")
async def transfer(data: TransferRequest, db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    return success_response(await operations.transfer(db, current_user, data, branch_id), status_code=201)


@router.post("/reconciliations")
async def reconcile(data: ReconciliationRequest, db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    return success_response(await operations.reconcile(db, current_user, data, branch_id), status_code=201)


@router.post("/assets")
async def asset(data: AssetRequest, db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    return success_response(await operations.register_asset(db, current_user, data, branch_id), status_code=201)


@router.post("/assets/{asset_id}/actions")
async def asset_action(asset_id: uuid.UUID, data: AssetAction, db: DbSession, current_user: CurrentUser):
    return success_response(await operations.asset_action(db, current_user, asset_id, data))


@router.post("/payroll/{payroll_id}/post")
async def payroll_post(payroll_id: uuid.UUID, data: PayrollPosting, db: DbSession, current_user: CurrentUser):
    return success_response(await operations.post_payroll(db, current_user, payroll_id, data.cash_account_id))


@router.patch("/payables/{bill_id}/terms")
async def bill_terms(bill_id: uuid.UUID, data: DueDateRequest, db: DbSession, current_user: CurrentUser):
    from app.modules.accounting.service.catalog import update_bill_terms
    return success_response(await update_bill_terms(db, current_user, bill_id, data))


@router.get("/accounts")
async def accounts(db: DbSession, current_user: CurrentUser, page: PageQuery, search: str = Query("", max_length=100), type: str | None = None, active: bool | None = None):
    from app.modules.accounting.repository.account import AccountRepository
    from app.modules.accounting.schemas.account import AccountRead
    tenant_id = workspace.allow(current_user, "chart_of_accounts")
    rows, total = await AccountRepository(db).filtered(tenant_id, search, type, active, page.offset, min(page.page_size, 100))
    return success_response({"items": [AccountRead.model_validate(r).model_dump() for r in rows], "total": total, "page": page.page, "page_size": min(page.page_size, 100)})


from app.modules.accounting.schemas.workspace import AccountImport


@router.post("/accounts/import")
async def import_accounts(data: AccountImport, db: DbSession, current_user: CurrentUser):
    from app.modules.accounting.service.catalog import bulk_accounts
    return success_response(await bulk_accounts(db, current_user, data.items), status_code=201)


@router.post("/accounts/export")
async def export_accounts(db: DbSession, current_user: CurrentUser):
    from app.modules.accounting.service.catalog import account_export
    return success_response(await account_export(db, current_user), status_code=201)


@router.get("/journals/{journal_id}")
async def journal(journal_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    from app.modules.accounting.service.workspace import journal_detail
    return success_response(await journal_detail(db, current_user, journal_id))


@router.get("/documents/{kind}/{document_id}")
async def source_document(kind: Literal["receivable", "payable"], document_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    return success_response(await workspace.source_document(db, current_user, document_id, kind == "payable"))


from app.modules.procurement.schemas.supplier_bill import SupplierPaymentCreate


@router.post("/documents/payable/{document_id}/payments")
async def supplier_payment(document_id: uuid.UUID, data: SupplierPaymentCreate, db: DbSession, current_user: CurrentUser):
    workspace.allow(current_user, "accounts_payable", "create")
    await workspace.source_document(db, current_user, document_id, True)
    if not data.client_reference:
        from app.core.exceptions import ValidationError
        raise ValidationError("A stable payment reference is required")
    from app.modules.procurement.service.supplier_bill import record_payment
    return success_response((await record_payment(db, current_user.tenant_id, current_user.id, document_id, data, current_user)).model_dump())


from app.modules.accounting.schemas.tax import TaxPaymentCreate


@router.post("/tax-payments")
async def tax_payment(data: TaxPaymentCreate, db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    from app.core.exceptions import ValidationError
    from app.modules.accounting.service.tax import create_tax_payment
    tenant_id = workspace.allow(current_user, "tax", "create")
    if await workspace.resolve_branch(db, current_user, None, branch_id):
        raise ValidationError("Tax records are business-wide; select All branches with an unrestricted finance account")
    if not data.client_reference:
        raise ValidationError("A stable tax payment reference is required")
    return success_response((await create_tax_payment(db, tenant_id, data, current_user.id)).model_dump(), status_code=201)
