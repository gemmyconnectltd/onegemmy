import uuid
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import lazyload

from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.schemas.report import CashFlowStatement

ZERO = Decimal(0)
CENT = Decimal("0.01")


def allocate_cash(net: Decimal, counterparts: list[tuple[object, Decimal]]) -> list[tuple[object, Decimal]]:
    """Allocate a compound journal's NET cash once; no cash-to-cash or noncash duplication."""
    eligible = [(account, -signed) for account, signed in counterparts if signed * net < 0]
    weight = sum((abs(amount) for _, amount in eligible), ZERO)
    if not weight or not net:
        return []
    allocated, used = [], ZERO
    for index, (account, amount) in enumerate(eligible):
        part = net - used if index == len(eligible) - 1 else (net * abs(amount) / weight).quantize(CENT, rounding=ROUND_HALF_UP)
        allocated.append((account, part))
        used += part
    return allocated


async def calculate_cash_flow(db, tenant_id: uuid.UUID, from_date: date | None,
                              to_date: date | None, branch_id: uuid.UUID | None = None) -> CashFlowStatement:
    from app.modules.accounting.service.statements import _cashflow_section, _section_from_map

    repo = ReportingRepository(db)
    balances = await repo.balances(tenant_id, from_date, to_date, branch_id)
    cash = lambda a: a.type == "Assets" and a.code.startswith("10")

    cash_txns = repo.ledger(tenant_id, from_date, to_date, branch_id).with_only_columns(Transaction.id).where(
        Account.type == "Assets", Account.code.startswith("10")
    ).distinct()
    stmt = repo.ledger(tenant_id, from_date, to_date, branch_id).where(Transaction.id.in_(cash_txns)).options(lazyload("*"))
    stream = await db.stream(stmt.order_by(Transaction.id, TransactionLine.id).execution_options(yield_per=100))
    sections = {"operating": {}, "investing": {}, "financing": {}}
    current_id, net, counterparts = None, ZERO, []

    def consume():
        for account, amount in allocate_cash(net, counterparts):
            group = sections[_cashflow_section(account)]
            key = (account.code, account.name)
            group[key] = group.get(key, ZERO) + amount

    async for line, txn, account in stream:
        if current_id is not None and txn.id != current_id:
            consume()
            net, counterparts = ZERO, []
        current_id = txn.id
        amount = Decimal(line.amount) if line.type == "debit" else -Decimal(line.amount)
        if cash(account):
            net += amount
        else:
            counterparts.append((account, amount))
    consume()
    opening = ZERO
    if from_date:
        previous = await repo.balances(tenant_id, to_date=from_date - timedelta(days=1), branch_id=branch_id)
        opening = sum((b["balance"] for b in previous.values() if cash(b["account"])), ZERO)
    ending = opening + sum((b["balance"] for b in balances.values() if cash(b["account"])), ZERO)
    operating = _section_from_map("Operating Activities", sections["operating"])
    investing = _section_from_map("Investing Activities", sections["investing"])
    financing = _section_from_map("Financing Activities", sections["financing"])
    return CashFlowStatement(from_date=from_date, to_date=to_date, operating=operating, investing=investing,
                             financing=financing, net_cash_change=round(operating.total + investing.total + financing.total, 2),
                             beginning_cash=opening, ending_cash=ending)
