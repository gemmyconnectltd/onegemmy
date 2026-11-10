"""VAT report: output VAT by treatment, input VAT (recoverable and not), returns, and the net position, all in the
business's base currency, built from what was recorded on each document, then compared with the ledger.

Sources, in order of preference:
- sales lines with a tax snapshot (line-level VAT): treatment, taxable base and VAT exactly as sold;
- sales from before line-level VAT: their order-level tax (VAT > 0 = standard-rated; 0 = recorded without VAT);
- sales returns: the VAT reversed on each returned line (older returns: a share of the original sale's VAT);
- purchase lines: input VAT on received quantities, split recoverable / non-recoverable;
- purchase returns: the recoverable input VAT they carried back.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

ZERO = Decimal(0)
TREATMENTS = ("standard", "zero_rated", "exempt", "out_of_scope", "not_registered", "unclassified")


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


async def vat_report(db: AsyncSession, tenant_id: uuid.UUID, start: date, end: date, branch_id: uuid.UUID | None = None,
                     treatment: str | None = None) -> dict:
    from app.modules.accounting.models.account import Account
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.models.transaction_line import TransactionLine
    from app.modules.procurement.models.purchase_item import PurchaseItem
    from app.modules.procurement.models.purchase_order import PurchaseOrder
    from app.modules.procurement.models.purchase_return import PurchaseReturn
    from app.modules.sales.models.order import Order
    from app.modules.sales.models.order_item import OrderItem
    from app.modules.sales.models.return_ import Return
    from app.modules.sales.models.return_item import ReturnItem

    rate = func.coalesce(Order.exchange_rate, 1)
    day = func.date(Order.ordered_at)
    sold = and_(Order.tenant_id == tenant_id, Order.status == "Completed", day >= start, day <= end, *([Order.branch_id == branch_id] if branch_id else []))

    sales: dict[str, dict[str, Decimal]] = {t: {"base": ZERO, "tax": ZERO, "documents": ZERO} for t in TREATMENTS}
    # 1. Line-level snapshots.
    rows = (await db.execute(
        select(OrderItem.tax_treatment, func.sum(OrderItem.taxable_base * rate), func.sum(OrderItem.tax_amount * rate), func.count(func.distinct(Order.id)))
        .join(Order, Order.id == OrderItem.order_id).where(sold, OrderItem.tax_treatment.isnot(None)).group_by(OrderItem.tax_treatment))).all()
    for kind, base, tax, docs in rows:
        bucket = sales.setdefault(kind, {"base": ZERO, "tax": ZERO, "documents": ZERO})
        bucket["base"] += _d(base)
        bucket["tax"] += _d(tax)
        bucket["documents"] += Decimal(docs)
    # 2. Sales from before line-level VAT: the order's own recorded tax.
    has_snapshot = select(OrderItem.id).where(OrderItem.order_id == Order.id, OrderItem.tax_treatment.isnot(None)).exists()
    legacy = (await db.execute(
        select(case((Order.tax > 0, "standard"), else_="unclassified"),
               func.sum((Order.total - Order.tax) * rate), func.sum(Order.tax * rate), func.count())
        .where(sold, ~has_snapshot).group_by(literal_column("1")))).all()
    for kind, base, tax, docs in legacy:
        sales[kind]["base"] += _d(base)
        sales[kind]["tax"] += _d(tax)
        sales[kind]["documents"] += Decimal(docs)

    # Sales returns approved in the period.
    ret_rate = func.coalesce(Return.exchange_rate, 1)
    returned = and_(Return.tenant_id == tenant_id, Return.status == "Approved", Return.return_date >= start, Return.return_date <= end)
    if branch_id:
        returned = and_(returned, Return.order_id.in_(select(Order.id).where(Order.tenant_id == tenant_id, Order.branch_id == branch_id)))
    snap_returns = (await db.execute(
        select(ReturnItem.tax_treatment, func.sum(ReturnItem.line_refund * ret_rate), func.sum(ReturnItem.tax_amount * ret_rate))
        .join(Return, Return.id == ReturnItem.return_id).where(returned, ReturnItem.tax_amount.isnot(None)).group_by(ReturnItem.tax_treatment))).all()
    returns = {kind: {"gross": _d(gross), "tax": _d(tax)} for kind, gross, tax in snap_returns}
    # Older returns: the original sale's VAT share of the refund (the rule their journals were posted with).
    old = (await db.execute(
        select(func.sum(func.coalesce(Return.base_refund_amount, Return.refund_amount)
                        * case((Order.base_total > 0, func.coalesce(Order.base_tax, 0) / Order.base_total), else_=0)))
        .select_from(Return).join(Order, Order.id == Return.order_id)
        .where(returned, ~select(ReturnItem.id).where(ReturnItem.return_id == Return.id, ReturnItem.tax_amount.isnot(None)).exists()))).scalar()
    if old:
        returns.setdefault("standard", {"gross": ZERO, "tax": ZERO})["tax"] += _d(old)

    # Input VAT on purchases received in the period (received share of each line).
    p_rate = func.coalesce(PurchaseOrder.exchange_rate, 1)
    p_day = func.date(PurchaseOrder.received_at)
    received = and_(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.received_at.isnot(None), p_day >= start, p_day <= end,
                    *([PurchaseOrder.branch_id == branch_id] if branch_id else []))
    share = PurchaseItem.received_quantity / func.nullif(PurchaseItem.quantity, 0)
    discount = case((PurchaseOrder.subtotal > 0, (PurchaseOrder.subtotal - PurchaseOrder.discount) / PurchaseOrder.subtotal), else_=1)
    vat = PurchaseItem.tax_amount * share * discount * p_rate
    inputs = (await db.execute(
        select(func.sum(case((PurchaseItem.vat_recoverable.is_(False), 0), else_=vat)), func.sum(case((PurchaseItem.vat_recoverable.is_(False), vat), else_=0)))
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseItem.purchase_order_id).where(received, PurchaseItem.tax_amount.isnot(None)))).one()
    recoverable, non_recoverable = _d(inputs[0]), _d(inputs[1])
    purchase_return_vat = _d((await db.execute(
        select(func.sum(PurchaseReturn.base_input_vat)).where(
            PurchaseReturn.tenant_id == tenant_id, PurchaseReturn.return_date >= start, PurchaseReturn.return_date <= end,
            *([PurchaseReturn.purchase_order_id.in_(select(PurchaseOrder.id).where(PurchaseOrder.branch_id == branch_id))] if branch_id else [])))).scalar())

    output_vat = sum((b["tax"] for b in sales.values()), ZERO)
    returns_vat = sum((r["tax"] for r in returns.values()), ZERO)
    net = output_vat - returns_vat - (recoverable - purchase_return_vat)

    # The ledger over the same days: VAT Payable (2100) credits less debits, Input VAT Recoverable (1150) debits less credits.
    async def movement(code: str, sign: int) -> Decimal:
        value = (await db.execute(
            select(func.sum(case((TransactionLine.type == "credit", TransactionLine.amount), else_=-TransactionLine.amount)))
            .join(Transaction, Transaction.id == TransactionLine.transaction_id).join(Account, Account.id == TransactionLine.account_id)
            .where(Transaction.tenant_id == tenant_id, Transaction.status == "Posted", Account.code == code,
                   Transaction.transaction_date >= start, Transaction.transaction_date <= end,
                   *([Transaction.branch_id == branch_id] if branch_id else [])))).scalar()
        return _d(value) * sign

    ledger_output, ledger_input = await movement("2100", 1), await movement("1150", -1)
    out_sales = {k: {"base": str(v["base"]), "tax": str(v["tax"]), "documents": int(v["documents"])} for k, v in sales.items()
                 if (v["base"] or v["tax"] or v["documents"]) and (treatment is None or k == treatment)}
    return {
        "period": {"from": start.isoformat(), "to": end.isoformat()}, "branch_id": str(branch_id) if branch_id else None,
        "sales": out_sales,
        "returns": {k: {"gross": str(v["gross"]), "tax": str(v["tax"])} for k, v in returns.items()},
        "output_vat": str(output_vat), "returns_vat": str(returns_vat),
        "input_vat": {"recoverable": str(recoverable), "non_recoverable": str(non_recoverable), "purchase_returns": str(purchase_return_vat)},
        "net_vat": str(net),
        "ledger": {"vat_payable_movement": str(ledger_output), "input_vat_movement": str(ledger_input),
                   "difference": str((ledger_output - ledger_input) - net)},
    }
