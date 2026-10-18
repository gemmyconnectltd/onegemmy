"""Audited, retry-safe accounting operations over the existing journal engine."""
import calendar
import uuid
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.models.workspace import BankReconciliation, FixedAsset
from app.modules.accounting.repository import AccountRepository, TransactionRepository
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.repository.workspace import WorkspaceRepository
from app.modules.accounting.schemas.workspace import (
    AssetAction,
    AssetRequest,
    IncomeReceipt,
    ReconciliationRequest,
    TransferRequest,
)
from app.modules.accounting.service.workspace import allow, encoded, resolve_branch
from app.modules.audit.service import record_audit
from app.modules.tenants.models import User

ZERO = Decimal(0)


async def account(db, tenant_id, account_id, type_=None, cash=False):
    acc = await AccountRepository(db).get_by_id_for_tenant(tenant_id, account_id)
    if acc is None or not acc.is_active or (type_ and acc.type != type_):
        raise ValidationError("Select an active account of the required type from this business")
    if cash and not (acc.type == "Assets" and acc.normal_balance == "debit" and acc.code.startswith("10")):
        raise ValidationError("Cash, bank and mobile money accounts must be debit-balance Assets in the 10xx range")
    return acc


async def journal(db, user, reference, date_, description, lines, branch_id=None, type_="manual") -> Transaction:
    """No commits: caller owns the operation and audit transaction."""
    tenant_id = user.tenant_id
    repo = TransactionRepository(db)
    existing = await repo.by_reference(tenant_id, reference)
    wanted = sorted((str(a), side, Decimal(amount)) for a, side, amount in lines if Decimal(amount))
    if existing:
        actual = sorted((str(l.account_id), l.type, Decimal(l.amount)) for l in existing.lines)
        if actual != wanted or existing.transaction_date != date_ or existing.branch_id != branch_id or existing.status != "Posted":
            raise ConflictError("Reference was already used with different journal details")
        return existing
    if sum((v for _, side, v in wanted if side == "debit"), ZERO) != sum((v for _, side, v in wanted if side == "credit"), ZERO):
        raise ValidationError("Journal is not balanced")
    for account_id in {a for a, _, _ in wanted}:
        await account(db, tenant_id, uuid.UUID(account_id))
    from app.modules.currency.service import get_base_currency
    txn = Transaction(tenant_id=tenant_id, branch_id=branch_id, reference=reference, type=type_, status="Posted",
                      transaction_date=date_, description=description, created_by=user.id, currency_code=await get_base_currency(db, tenant_id))
    db.add(txn)
    await db.flush()
    for account_id, side, amount in wanted:
        if amount <= 0:
            raise ValidationError("Journal line amounts must be positive")
        db.add(TransactionLine(transaction_id=txn.id, account_id=uuid.UUID(account_id), type=side, amount=amount))
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="transaction.post", entity_type="transaction", entity_id=str(txn.id), summary=description)
    return txn


async def transfer(db, user: User, data: TransferRequest, active_branch=None):
    tenant_id = allow(user, "banking", "create")
    allow(user, "journal_entries", "approve")
    branch_id = await resolve_branch(db, user, data.branch_id, active_branch)
    await ReportingRepository(db).lock_tenant(tenant_id)
    if data.from_account_id == data.to_account_id:
        raise ValidationError("Choose two different cash accounts")
    await account(db, tenant_id, data.from_account_id, cash=True)
    await account(db, tenant_id, data.to_account_id, cash=True)
    txn = await journal(db, user, f"TRF-{data.reference}", data.transaction_date, data.description,
                        [(data.from_account_id, "credit", data.amount), (data.to_account_id, "debit", data.amount)], branch_id, "cash_transfer")
    await db.commit()
    return {"id": str(txn.id), "reference": txn.reference}


async def reconcile(db, user: User, data: ReconciliationRequest, active_branch=None):
    tenant_id = allow(user, "banking", "approve")
    branch_id = await resolve_branch(db, user, data.branch_id, active_branch)
    await account(db, tenant_id, data.account_id, cash=True)
    await ReportingRepository(db).lock_tenant(tenant_id)
    existing = await WorkspaceRepository(db).record(BankReconciliation, tenant_id, reference=data.reference)
    if existing:
        if existing.account_id != data.account_id or existing.as_of != data.as_of or existing.statement_balance != data.statement_balance or existing.branch_id != branch_id:
            raise ConflictError("Reconciliation reference was already used")
        return encoded({"id": existing.id, "ledger_balance": existing.ledger_balance, "difference": existing.statement_balance - existing.ledger_balance})
    balances = await ReportingRepository(db).balances(tenant_id, to_date=data.as_of, branch_id=branch_id)
    ledger = balances.get(data.account_id, {}).get("balance", ZERO)
    row = BankReconciliation(tenant_id=tenant_id, branch_id=branch_id, account_id=data.account_id, as_of=data.as_of,
                             statement_balance=data.statement_balance, ledger_balance=ledger, reference=data.reference, notes=data.notes, created_by=user.id)
    db.add(row)
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="bank.reconcile", entity_type="bank_reconciliation", entity_id=str(row.id), summary=f"Recorded balance reconciliation {data.reference}")
    await db.commit()
    return encoded({"id": row.id, "ledger_balance": ledger, "difference": data.statement_balance - ledger})


async def register_asset(db, user: User, data: AssetRequest, active_branch=None):
    tenant_id = allow(user, "fixed_assets", "create")
    branch_id = await resolve_branch(db, user, data.branch_id, active_branch)
    await ReportingRepository(db).lock_tenant(tenant_id)
    if data.acquisition_date > datetime.now(UTC).date():
        raise ValidationError("Acquisition date cannot be in the future")
    existing = await WorkspaceRepository(db).record(FixedAsset, tenant_id, reference=data.reference)
    if existing:
        if existing.branch_id != branch_id or any(getattr(existing, key) != value for key, value in data.model_dump(exclude={"branch_id", "paid_from_account_id", "acquisition_transaction_id"}).items()) or (data.acquisition_transaction_id is not None and data.acquisition_transaction_id != existing.acquisition_transaction_id):
            raise ConflictError("Asset reference was already used")
        if data.paid_from_account_id:
            prior = await TransactionRepository(db).get_by_id_for_tenant(tenant_id, existing.acquisition_transaction_id)
            if prior is None or prior.type != "asset_acquisition" or not any(l.account_id == data.paid_from_account_id and l.type == "credit" and Decimal(l.amount) == data.cost for l in prior.lines):
                raise ConflictError("Asset reference was already used with a different payment source")
        return encoded({"id": existing.id})
    asset_account = await account(db, tenant_id, data.asset_account_id, "Assets")
    if asset_account.normal_balance != "debit" or asset_account.code.startswith("10"):
        raise ValidationError("Choose a debit-balance fixed asset account, separate from cash accounts")
    contra = await account(db, tenant_id, data.depreciation_account_id, "Assets")
    if contra.normal_balance != "credit" or data.asset_account_id == data.depreciation_account_id:
        raise ValidationError("Accumulated depreciation must be a separate credit-balance Asset account")
    await account(db, tenant_id, data.expense_account_id, "Expense")
    if data.paid_from_account_id:
        allow(user, "journal_entries", "approve")
        await account(db, tenant_id, data.paid_from_account_id, cash=True)
        source = await journal(db, user, f"ACQ-{uuid.uuid5(tenant_id, data.reference).hex}", data.acquisition_date, f"Acquisition {data.name}",
            [(data.asset_account_id, "debit", data.cost), (data.paid_from_account_id, "credit", data.cost)], branch_id, "asset_acquisition")
        acquisition_id = source.id
    else:
        acquisition_id = data.acquisition_transaction_id
    txn = await TransactionRepository(db).get_by_id_for_tenant(tenant_id, acquisition_id)
    if txn is None or txn.status != "Posted" or txn.branch_id != branch_id or txn.transaction_date != data.acquisition_date:
        raise ValidationError("Choose a posted acquisition journal in the selected branch and acquisition date")
    debits = sum((Decimal(l.amount) if l.type == "debit" else -Decimal(l.amount) for l in txn.lines if l.account_id == data.asset_account_id), ZERO)
    allocated = await WorkspaceRepository(db).allocated_asset_cost(tenant_id, txn.id, data.asset_account_id)
    if allocated + data.cost > debits:
        raise ValidationError("Registered asset costs exceed the posted acquisition debit")
    row = FixedAsset(tenant_id=tenant_id, created_by=user.id, **data.model_dump(exclude={"branch_id", "paid_from_account_id", "acquisition_transaction_id"}), acquisition_transaction_id=txn.id, branch_id=branch_id)
    db.add(row)
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action="asset.register", entity_type="fixed_asset", entity_id=str(row.id), summary=f"Registered asset {row.reference}")
    await db.commit()
    return encoded({"id": row.id})


def depreciation_target(cost: Decimal, salvage: Decimal, life_months: int, acquisition: date, as_of: date) -> Decimal:
    # Full months at month-end, beginning with the acquisition month. No estimate is silently posted.
    months = (as_of.year - acquisition.year) * 12 + as_of.month - acquisition.month
    if as_of.day == calendar.monthrange(as_of.year, as_of.month)[1]:
        months += 1
    months = max(0, min(life_months, months))
    return ((cost - salvage) * Decimal(months) / Decimal(life_months)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def asset_action(db, user: User, asset_id: uuid.UUID, data: AssetAction):
    tenant_id = allow(user, "fixed_assets", "approve")
    allow(user, "journal_entries", "approve")
    await ReportingRepository(db).lock_tenant(tenant_id)
    row = await WorkspaceRepository(db).record(FixedAsset, tenant_id, id=asset_id, lock=True)
    if row is None:
        raise NotFoundError("Asset not found")
    if user.branch_id and row.branch_id != user.branch_id:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("Asset is outside the assigned branch")
    await resolve_branch(db, user, row.branch_id)
    if data.as_of < row.acquisition_date or data.as_of > datetime.now(UTC).date():
        raise ValidationError("Choose a date between acquisition and today")
    if row.disposed_on:
        if data.action == "dispose" and row.disposed_on == data.as_of and row.disposal_proceeds == data.proceeds:
            return encoded({"id": row.id})
        raise ValidationError("Disposed assets cannot be changed")
    if row.depreciated_through and data.as_of < row.depreciated_through:
        raise ValidationError("Cannot post before the last depreciation date")
    if data.action == "depreciate" and data.as_of.day != calendar.monthrange(data.as_of.year, data.as_of.month)[1]:
        raise ValidationError("Depreciation is posted at a calendar month end")
    target = depreciation_target(row.cost, row.salvage, row.life_months, row.acquisition_date, data.as_of)
    amount = target - row.accumulated
    if amount > 0:
        await journal(db, user, f"DEP-{row.id.hex}-{data.as_of:%Y%m}", data.as_of, f"Depreciation {row.reference}",
                      [(row.expense_account_id, "debit", amount), (row.depreciation_account_id, "credit", amount)], row.branch_id, "depreciation")
        row.accumulated = target
        row.depreciated_through = data.as_of
    if data.action == "dispose":
        if data.cash_account_id is None or data.gain_loss_account_id is None:
            raise ValidationError("Select the proceeds account and disposal gain/loss account")
        await account(db, tenant_id, data.cash_account_id, cash=True)
        gain = data.proceeds - (row.cost - row.accumulated)
        await account(db, tenant_id, data.gain_loss_account_id, "Revenue" if gain >= 0 else "Expense")
        lines = [(row.asset_account_id, "credit", row.cost), (row.depreciation_account_id, "debit", row.accumulated), (data.cash_account_id, "debit", data.proceeds)]
        if gain:
            lines.append((data.gain_loss_account_id, "credit" if gain > 0 else "debit", abs(gain)))
        txn = await journal(db, user, f"DISPOSE-{row.id.hex}", data.as_of, f"Disposal {row.reference}", lines, row.branch_id, "asset_disposal")
        row.disposed_on, row.disposal_transaction_id, row.disposal_proceeds = data.as_of, txn.id, data.proceeds
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, action=f"asset.{data.action}", entity_type="fixed_asset", entity_id=str(row.id), summary=f"{data.action.title()} {row.reference}")
    await db.commit()
    return encoded({"id": row.id, "accumulated": row.accumulated, "net_book_value": row.cost - row.accumulated})


async def post_payroll(db, user: User, payroll_id: uuid.UUID, cash_account_id: uuid.UUID):
    from app.modules.accounting.service.transaction import _get_account_by_code
    from app.modules.hr.models.payroll import PayrollEntry
    tenant_id = allow(user, "payroll", "approve")
    allow(user, "journal_entries", "approve")
    if user.branch_id:
        raise ValidationError("Payroll records are business-wide and require an unrestricted finance account")
    await ReportingRepository(db).lock_tenant(tenant_id)
    row = await WorkspaceRepository(db).record(PayrollEntry, tenant_id, id=payroll_id, lock=True)
    if row is None:
        raise NotFoundError("Payroll entry not found")
    if row.status != "Paid" or row.paid_at is None:
        raise ValidationError("Only a payroll entry already marked Paid in HR can be posted as a cash payment")
    await account(db, tenant_id, cash_account_id, cash=True)
    expense = await _get_account_by_code(db, tenant_id, "5300")
    withholding = await _get_account_by_code(db, tenant_id, "2150")
    gross = Decimal(row.base_salary) + Decimal(row.bonus)
    deductions, net = Decimal(row.deductions), Decimal(row.net_pay)
    if gross <= 0 or deductions < 0 or net < 0 or gross != deductions + net:
        raise ValidationError("HR gross, deductions and net pay do not reconcile")
    txn = await journal(db, user, f"PAYROLL-{row.id.hex}", row.paid_at.date(), f"Payroll {row.period}",
                        [(expense, "debit", gross), (withholding, "credit", deductions), (cash_account_id, "credit", net)], type_="payroll")
    await db.commit()
    return encoded({"id": txn.id, "reference": txn.reference})


async def income_receipt(db: AsyncSession, user: User, data: IncomeReceipt,
                         active_branch: uuid.UUID | None = None):
    from app.modules.accounting.schemas import TransactionCreate
    from app.modules.accounting.service.tax import (
        calculate_vat,
        get_effective_vat_rate,
        is_vat_enabled,
    )
    from app.modules.accounting.service.transaction import create_transaction
    tenant_id = allow(user, "journal_entries", "create")
    branch_id = await resolve_branch(db, user, data.branch_id, active_branch)
    await account(db, tenant_id, data.cash_account_id, cash=True)
    await account(db, tenant_id, data.revenue_account_id, "Revenue")
    tax = ZERO
    if data.apply_vat:
        if not await is_vat_enabled(db, tenant_id) or data.vat_account_id is None:
            raise ValidationError("Enable VAT in business settings and select a VAT liability account")
        await account(db, tenant_id, data.vat_account_id, "Liabilities")
        rate = await get_effective_vat_rate(db, tenant_id)
        tax = Decimal(str(calculate_vat(data.amount, inclusive=True, rate=rate)["vat_amount"]))
    lines = [{"account_id": data.cash_account_id, "type": "debit", "amount": data.amount},
             {"account_id": data.revenue_account_id, "type": "credit", "amount": data.amount - tax}]
    if tax:
        lines.append({"account_id": data.vat_account_id, "type": "credit", "amount": tax})
    return await create_transaction(db, tenant_id, user.id, TransactionCreate(type="manual", client_reference=data.client_reference,
        transaction_date=data.transaction_date.isoformat(), description=data.description, branch_id=branch_id, lines=lines))
