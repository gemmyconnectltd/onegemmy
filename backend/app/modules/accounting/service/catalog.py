from datetime import UTC, datetime

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.workspace import (
    AccountingPreference,
    FinancialSnapshot,
    FinancialSnapshotRow,
)
from app.modules.accounting.repository.account import AccountRepository
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.repository.workspace import WorkspaceRepository
from app.modules.accounting.schemas.account import AccountCreate
from app.modules.accounting.service.workspace import allow, read_snapshot
from app.modules.audit.service import record_audit
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill
from app.modules.tenants.models import Tenant


async def update_preferences(db, user, data):
    tenant_id = allow(user, "tenants", "update")
    if user.branch_id:
        raise ValidationError("Fiscal preferences require business-wide administration")
    row = await db.get(AccountingPreference, tenant_id)
    if row is None:
        row = AccountingPreference(tenant_id=tenant_id)
        db.add(row)
    row.fiscal_start_month = data.fiscal_start_month
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="accounting.fiscal_preferences", entity_type="tenant", entity_id=str(tenant_id), summary="Updated fiscal reporting start month")
    await db.commit()
    return {"fiscal_start_month": row.fiscal_start_month}


async def update_bill_terms(db, user, bill_id, data):
    tenant_id = allow(user, "accounts_payable", "update")
    row = await WorkspaceRepository(db).record(SupplierBill, tenant_id, id=bill_id, lock=True)
    if row is None:
        raise NotFoundError("Supplier bill not found")
    order = await WorkspaceRepository(db).record(PurchaseOrder, tenant_id, id=row.purchase_order_id)
    if order is None or (user.branch_id and user.branch_id != order.branch_id):
        raise NotFoundError("Supplier bill not found in this branch")
    if data.due_date and data.due_date < row.bill_date:
        raise ValidationError("Due date cannot precede the bill date")
    row.due_date = data.due_date
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="bill.terms", entity_type="supplier_bill", entity_id=str(row.id), summary=f"Updated due date for {row.reference}", changes={"due_date": data.due_date.isoformat() if data.due_date else None})
    await db.commit()
    return {"id": str(row.id), "due_date": data.due_date.isoformat() if data.due_date else None}


async def bulk_accounts(db, user, items: list[AccountCreate]):
    tenant_id = allow(user, "chart_of_accounts", "create")
    await ReportingRepository(db).lock_tenant(tenant_id)
    codes = [item.code for item in items]
    if len(codes) != len(set(codes)):
        raise ValidationError("Import contains duplicate account codes")
    existing = await AccountRepository(db).get_many(tenant_id, codes=codes)
    if existing:
        raise ConflictError("Some account codes already exist; the import was not applied")
    parents = {i.parent_id for i in items if i.parent_id}
    parent_map = {a.id: a for a in await AccountRepository(db).get_many(tenant_id, ids=parents)} if parents else {}
    for item in items:
        if item.parent_id and (item.parent_id not in parent_map or parent_map[item.parent_id].type != item.type):
            raise ValidationError("Import parent accounts must exist in the same business and account type")
    db.add_all([Account(tenant_id=tenant_id, **item.model_dump()) for item in items])
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="accounts.import", entity_type="account_import", entity_id=None, summary=f"Imported {len(items)} chart accounts")
    await db.commit()
    return {"created": len(items)}


async def account_export(db, user):
    tenant_id = allow(user, "chart_of_accounts")
    tenant = await db.get(Tenant, tenant_id)
    snapshot = FinancialSnapshot(tenant_id=tenant_id, kind="chart-of-accounts", created_by=user.id, data={})
    db.add(snapshot)
    await db.flush()
    index = 0
    pending = []
    from sqlalchemy import insert
    async for account in AccountRepository(db).stream_chart(tenant_id):
        pending.append({"tenant_id": tenant_id, "snapshot_id": snapshot.id, "position": index, "data": {"code": account.code, "name": account.name, "type": account.type,
                        "group": account.group_name or "Not grouped", "status": "Active" if account.is_active else "Inactive"}})
        index += 1
        if len(pending) == 100:
            await db.execute(insert(FinancialSnapshotRow), pending)
            pending.clear()
    if pending:
        await db.execute(insert(FinancialSnapshotRow), pending)
    today = datetime.now(UTC).date().isoformat()
    snapshot.data = {"kind": "chart-of-accounts", "title": "Chart of Accounts", "business": tenant.name, "currency": tenant.currency, "branch": "Business chart",
                     "as_of": today, "from_date": today, "to_date": today, "generated_at": datetime.now(UTC).isoformat(), "row_count": index, "totals": {}, "notes": [],
                     "columns": [{"key": key, "label": key.title(), "kind": "text"} for key in ["code", "name", "type", "group", "status"]]}
    await db.commit()
    return await read_snapshot(db, user, snapshot.id)
