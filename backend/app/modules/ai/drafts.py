"""Write-capable assistant features, done safely: the model can only PREPARE a draft (a row in
ai_actions + a preview). The business record is created by `confirm_action`, called from an explicit
user click, which re-validates everything and is idempotent. Drafts never post financial entries:
an invoice draft is a Pending order (no stock movement, no ledger), a purchase draft is a Draft PO."""
import html
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from pydantic import Field, model_validator
from sqlalchemy import func, or_, select

from app.core.currency import format_money, to_decimal
from app.core.email import _branded_html, send_email
from app.core.exceptions import AppError, NotFoundError, ValidationError
from app.modules.ai.models import AiAction
from app.modules.ai.tools import ToolContext, ToolError, _Args, _result, tool
from app.modules.audit.service import record_audit
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant

ACTION_TTL = timedelta(minutes=30)
KIND_PERMISSION = {
    "invoice": ("orders:create", "sales"),
    "purchase_order": ("purchase_orders:create", "procurement"),
    "payment_reminder": ("accounts_receivable:create", "sales"),
}
REMINDER_COOLDOWN = timedelta(hours=24)


class ItemReq(_Args):
    product_name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0, le=100000)


class DraftInvoiceArgs(_Args):
    customer_name: str = Field(min_length=1, max_length=120)
    items: list[ItemReq] = Field(min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=300)
    due_in_days: int = Field(default=30, ge=0, le=365)


class DraftReminderArgs(_Args):
    customer_name: str = Field(min_length=1, max_length=120)


class DraftPurchaseArgs(_Args):
    supplier_name: str | None = Field(default=None, max_length=120)
    items: list[ItemReq] | None = Field(default=None, max_length=20)
    from_reorder_days: int | None = Field(default=None, ge=3, le=90)

    @model_validator(mode="after")
    def _one_source(self):
        if bool(self.items) == (self.from_reorder_days is not None):
            raise ValueError("give either items or from_reorder_days")
        return self


def _like(value: str) -> str:
    """Escape LIKE wildcards so a name containing % or _ can't widen the search."""
    return "%" + value.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


async def _one(ctx: ToolContext, what: str, query: str, stmt_for) -> Any:
    """Resolve a free-text name to exactly one record, or explain why not — never guess between several."""
    variants = [query.strip()] + ([query.strip()[:-1]] if query.strip().lower().endswith("s") and len(query.strip()) > 3 else [])
    for q in variants:
        rows = (await ctx.db.execute(stmt_for(_like(q)).limit(6))).scalars().all()
        if len(rows) == 1:
            return rows[0]
        exact = [r for r in rows if r.name.lower() == q.lower()]
        if len(exact) == 1:
            return exact[0]
        if len(rows) > 1:
            raise ToolError(f"More than one {what} matches '{query}': {', '.join(r.name for r in rows[:5])}. Please tell me which one you mean.")
    raise ToolError(f"No {what} matching '{query}' was found in your business. Please check the name and try again.")


async def _store(ctx: ToolContext, kind: str, payload: dict, preview: dict) -> AiAction:
    action = AiAction(tenant_id=ctx.tenant_id, user_id=ctx.user.id, kind=kind, payload=payload, preview=preview,
                      expires_at=datetime.now(UTC) + ACTION_TTL)
    ctx.db.add(action)
    await ctx.db.flush()
    return action


def _action_view(a: AiAction) -> dict[str, Any]:
    return {"id": str(a.id), "kind": a.kind, "status": a.status, "expires_at": a.expires_at.isoformat(), **a.preview}


@tool("draft_invoice", "Prepare a DRAFT invoice (a pending order). Pass the customer name and each product name exactly as the user wrote it (e.g. \"laptops\") with a quantity. Do NOT ask the user for prices, SKUs or IDs — the server finds the customer and products and uses current selling prices. Shows a preview; nothing is saved until the user confirms.",
      module="sales", permission="orders:create", args=DraftInvoiceArgs, kind="draft")
async def draft_invoice(ctx: ToolContext, a: DraftInvoiceArgs) -> dict[str, Any]:
    customer = await _one(ctx, "customer", a.customer_name,
                          lambda like: select(Customer).where(Customer.tenant_id == ctx.tenant_id, Customer.is_active.is_(True), Customer.name.ilike(like, escape="\\")))
    lines, rows, warnings, total = [], [], [], Decimal(0)
    cur = ctx.base_currency
    for it in a.items:
        p = await _one(ctx, "product", it.product_name, lambda like: select(Product).where(
            Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True), or_(Product.name.ilike(like, escape="\\"), Product.sku.ilike(like, escape="\\"))))
        if p.has_variants:
            raise ToolError(f"'{p.name}' comes in different options (such as size or colour). Which one would you like?")
        price, qty = to_decimal(p.price), to_decimal(it.quantity)
        if price <= 0:
            raise ToolError(f"'{p.name}' has no selling price yet, so I can't add it to an invoice.")
        line = price * qty
        total += line
        if float(p.stock) < it.quantity:
            warnings.append(f"Only {float(p.stock):g} of {p.name} in stock (you asked for {it.quantity:g}).")
        lines.append({"product_id": str(p.id), "name": p.name, "sku": p.sku, "quantity": it.quantity, "unit_price": str(price)})
        rows.append([p.name, f"{it.quantity:g}", format_money(price, cur), format_money(line, cur)])
    due = (datetime.now(UTC) + timedelta(days=a.due_in_days)).date().isoformat()
    preview = {"title": f"Draft invoice for {customer.name}", "summary": f"{len(lines)} item(s), total {format_money(total, cur)} (VAT included). Saved as a Pending order: it does not change stock or your accounts until completed.",
               "columns": ["Product", "Qty", "Unit price", "Line total"], "rows": rows, "total": format_money(total, cur), "warnings": warnings,
               "confirm_label": "Create draft invoice"}
    act = await _store(ctx, "invoice", {"customer_id": str(customer.id), "lines": lines, "notes": a.notes, "due_date": due}, preview)
    return {**_result("draft_invoice", f"I prepared a draft invoice for {customer.name} totalling {format_money(total, cur)}. Please review the preview and press Confirm to create it; nothing is saved yet.",
                      ctx, how="I matched the customer and products by name and used your current selling prices.", links=[]), "action": _action_view(act)}


@tool("draft_purchase_order", "Prepare a DRAFT purchase order, either from product names + quantities as the user wrote them, or (from_reorder_days) for products likely to run out within N days. Do NOT ask for prices or IDs — costs come from the product records. Shows a preview; nothing is saved until the user confirms.",
      module="procurement", permission="purchase_orders:create", args=DraftPurchaseArgs, kind="draft")
async def draft_purchase_order(ctx: ToolContext, a: DraftPurchaseArgs) -> dict[str, Any]:
    from app.modules.ai.tools import reorder_candidates

    cur = ctx.base_currency
    supplier = None
    if a.supplier_name:
        supplier = await _one(ctx, "supplier", a.supplier_name, lambda like: select(Supplier).where(Supplier.tenant_id == ctx.tenant_id, Supplier.is_active.is_(True), Supplier.name.ilike(like, escape="\\")))
    wanted: list[tuple[Product, float]] = []
    if a.from_reorder_days is not None:
        wanted = [(p, float(need)) for p, need, *_ in await reorder_candidates(ctx, a.from_reorder_days, 20)]
        if not wanted:
            raise ToolError(f"None of your products are likely to run out within {a.from_reorder_days} days, so there is nothing to order.")
    else:
        for it in a.items or []:
            p = await _one(ctx, "product", it.product_name, lambda like: select(Product).where(
                Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True), or_(Product.name.ilike(like, escape="\\"), Product.sku.ilike(like, escape="\\"))))
            if p.has_variants:
                raise ToolError(f"'{p.name}' comes in different options. Which one would you like?")
            wanted.append((p, it.quantity))
    lines, rows, warnings, total = [], [], [], Decimal(0)
    for p, qty in wanted:
        qty = float(max(1, round(qty)))
        cost = to_decimal(p.cost)
        if cost <= 0:
            warnings.append(f"{p.name} has no purchase cost recorded; its line is priced at 0 — edit the draft before sending.")
        total += cost * to_decimal(qty)
        lines.append({"product_id": str(p.id), "name": p.name, "sku": p.sku, "quantity": qty, "unit_cost": str(cost)})
        rows.append([p.name, f"{qty:g}", format_money(cost, cur), format_money(cost * to_decimal(qty), cur)])
    preview = {"title": "Draft purchase order" + (f" to {supplier.name}" if supplier else ""),
               "summary": f"{len(lines)} product(s), estimated {format_money(total, cur)} at your recorded purchase costs. Saved as a Draft: it does not change stock until you receive it.",
               "columns": ["Product", "Qty", "Unit cost", "Line total"], "rows": rows, "total": format_money(total, cur), "warnings": warnings,
               "confirm_label": "Create draft purchase order"}
    act = await _store(ctx, "purchase_order", {"supplier_id": str(supplier.id) if supplier else None, "lines": lines}, preview)
    return {**_result("draft_purchase_order", f"I prepared a draft purchase order for {len(lines)} product(s), estimated {format_money(total, cur)}. Please review and press Confirm; nothing is saved yet.",
                      ctx, how="Quantities: " + ("based on how fast these products have been selling." if a.from_reorder_days else "as you requested.") + " Costs are the buying prices saved on each product.", links=[]),
            "action": _action_view(act)}


async def _open_invoices(ctx: ToolContext, customer_id: uuid.UUID) -> list[Any]:
    stmt = select(Order.order_number, Order.due_date, Order.total, Order.amount_paid, Order.currency_code, Order.exchange_rate).where(
        Order.tenant_id == ctx.tenant_id, Order.customer_id == customer_id, Order.status == "Completed", Order.amount_paid < Order.total,
    ).order_by(Order.due_date.asc().nulls_last(), Order.ordered_at)
    if ctx.branch_id is not None:
        stmt = stmt.where(Order.branch_id == ctx.branch_id)
    return list((await ctx.db.execute(stmt)).all())


def _reminder_message(business: str, customer: str, invoices: list[Any], base: str) -> tuple[str, str]:
    """A fixed, plain template — the model never writes text that is sent to a customer."""
    today = datetime.now(UTC).date()
    lines = []
    for o in invoices:
        code = o.currency_code or base
        due = f", due {o.due_date}" + (" (overdue)" if o.due_date < today else "") if o.due_date else ""
        lines.append(f"- Invoice {o.order_number}: {format_money(to_decimal(o.total) - to_decimal(o.amount_paid), code)} outstanding{due}")
    subject = f"Payment reminder from {business}"
    body = (f"Dear {customer},\n\nThis is a friendly reminder that the following invoice(s) from {business} are still unpaid:\n\n"
            + "\n".join(lines) + f"\n\nPlease arrange payment at your earliest convenience. If you have already paid, kindly ignore this message.\n\nThank you,\n{business}")
    return subject, body


@tool("draft_payment_reminder", "Prepare a DRAFT payment-reminder email to a customer about their unpaid invoices. Pass only the customer name as written; the server finds their invoices. Shows the exact message; nothing is sent until the user confirms.",
      module="sales", permission="accounts_receivable:create", args=DraftReminderArgs, kind="draft")
async def draft_payment_reminder(ctx: ToolContext, a: DraftReminderArgs) -> dict[str, Any]:
    customer = await _one(ctx, "customer", a.customer_name,
                          lambda like: select(Customer).where(Customer.tenant_id == ctx.tenant_id, Customer.is_active.is_(True), Customer.name.ilike(like, escape="\\")))
    if not customer.email:
        raise ToolError(f"{customer.name} has no email address on file, so a reminder can't be emailed. Add one in Customers first.")
    invoices = await _open_invoices(ctx, customer.id)
    if not invoices:
        raise ToolError(f"{customer.name} has no unpaid invoices, so there is nothing to remind them about.")
    business = (await ctx.db.execute(select(Tenant.name).where(Tenant.id == ctx.tenant_id))).scalar_one()
    subject, body = _reminder_message(business, customer.name, invoices, ctx.base_currency)
    cur = ctx.base_currency
    total = sum(((to_decimal(o.total) - to_decimal(o.amount_paid)) * to_decimal(o.exchange_rate or 1) for o in invoices), Decimal(0))
    rows = [[o.order_number, str(o.due_date or "—"), format_money(to_decimal(o.total) - to_decimal(o.amount_paid), o.currency_code or cur)] for o in invoices]
    preview = {"title": f"Payment reminder to {customer.name}", "summary": f"Will be emailed to {customer.email}. {len(invoices)} unpaid invoice(s), about {format_money(total, cur)} in {cur}.",
               "columns": ["Invoice", "Due", "Outstanding"], "rows": rows, "total": format_money(total, cur), "warnings": [], "message": f"Subject: {subject}\n\n{body}",
               "confirm_label": "Send reminder email"}
    act = await _store(ctx, "payment_reminder", {"customer_id": str(customer.id), "subject": subject}, preview)
    return {**_result("draft_payment_reminder", f"I drafted a payment reminder for {customer.name} ({len(invoices)} unpaid invoice(s)). Review the message and press Confirm to email it; nothing has been sent.",
                      ctx, how="Based on this customer's unpaid invoices. The message is a standard polite reminder.", links=[]), "action": _action_view(act)}


# ── confirm / cancel ──────────────────────────────────────────────────────────

async def _load_action(ctx: ToolContext, action_id: uuid.UUID, *, lock: bool) -> AiAction:
    stmt = select(AiAction).where(AiAction.id == action_id, AiAction.tenant_id == ctx.tenant_id, AiAction.user_id == ctx.user.id)
    if lock:
        stmt = stmt.with_for_update()
    action = (await ctx.db.execute(stmt)).scalar_one_or_none()
    if action is None:
        raise NotFoundError("That draft was not found")
    return action


async def confirm_action(ctx: ToolContext, action_id: uuid.UUID) -> dict[str, Any]:
    from app.modules.tenants.service.feature import feature_enabled

    action = await _load_action(ctx, action_id, lock=True)       # row lock: a double-click can't create twice
    if action.status == "confirmed":
        return action.result or {}                                # idempotent: same answer, no second record
    if action.status != "pending":
        raise ValidationError("This draft was cancelled")
    if action.expires_at < datetime.now(UTC):
        raise ValidationError("This draft expired. Ask Pesaa AI to prepare it again.")
    permission, module = KIND_PERMISSION[action.kind]
    if not ctx.can(permission) or not await feature_enabled(ctx.db, ctx.tenant_id, module):
        raise AppError("You no longer have permission to create this.", 403)

    if action.kind == "invoice":
        result = await _create_invoice(ctx, action)
    elif action.kind == "payment_reminder":
        result = await _send_reminder(ctx, action)
    else:
        result = await _create_purchase_order(ctx, action)
    action.status, action.result, action.confirmed_at = "confirmed", result, datetime.now(UTC)
    await record_audit(ctx.db, tenant_id=ctx.tenant_id, actor_user_id=ctx.user.id, actor_name=None, action="ai.action.confirm",
                       entity_type=action.kind, entity_id=str(action.id), summary=f"Confirmed an AI-prepared {action.kind.replace('_', ' ')} ({result.get('reference')})",
                       changes={"kind": action.kind, "reference": result.get("reference")})
    await ctx.db.commit()
    return result


async def cancel_action(ctx: ToolContext, action_id: uuid.UUID) -> None:
    action = await _load_action(ctx, action_id, lock=True)
    if action.status == "pending":
        action.status = "cancelled"
        await ctx.db.commit()


async def _create_invoice(ctx: ToolContext, action: AiAction) -> dict[str, Any]:
    from app.modules.sales.schemas import OrderCreate, OrderItemCreate
    from app.modules.sales.service import order as order_service

    p = action.payload
    customer = (await ctx.db.execute(select(Customer).where(Customer.id == uuid.UUID(p["customer_id"]), Customer.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if customer is None:
        raise ValidationError("That customer no longer exists")
    items = []
    for ln in p["lines"]:
        prod = (await ctx.db.execute(select(Product).where(Product.id == uuid.UUID(ln["product_id"]), Product.tenant_id == ctx.tenant_id))).scalar_one_or_none()
        if prod is None or not prod.is_active:
            raise ValidationError(f"{ln['name']} is no longer available")
        if to_decimal(prod.price) != to_decimal(ln["unit_price"]):
            raise ValidationError(f"The price of {prod.name} changed since the preview. Ask Pesaa AI to prepare the draft again.")
        items.append(OrderItemCreate(product_id=prod.id, product_name=prod.name, sku=prod.sku, unit_price=float(prod.price), quantity=ln["quantity"]))
    order = await order_service.create_order(
        ctx.db, ctx.tenant_id, ctx.user.id,
        OrderCreate(status="Pending", customer_id=customer.id, due_date=datetime.fromisoformat(p["due_date"]).date(), notes=p.get("notes"),
                    client_order_id=f"ai-{action.id}", items=items),   # also idempotent at the order level
        active_branch_id=ctx.branch_id,
    )
    return {"kind": "invoice", "reference": order.order_number, "href": "/sales/orders", "message": f"Draft invoice {order.order_number} created (Pending)."}


async def _create_purchase_order(ctx: ToolContext, action: AiAction) -> dict[str, Any]:
    from app.modules.procurement.schemas import PurchaseCreate
    from app.modules.procurement.schemas.purchase import PurchaseItemCreate
    from app.modules.procurement.service import purchase as purchase_service

    p = action.payload
    items = []
    for ln in p["lines"]:
        prod = (await ctx.db.execute(select(Product).where(Product.id == uuid.UUID(ln["product_id"]), Product.tenant_id == ctx.tenant_id))).scalar_one_or_none()
        if prod is None or not prod.is_active:
            raise ValidationError(f"{ln['name']} is no longer available")
        items.append(PurchaseItemCreate(product_id=prod.id, product_name=prod.name, sku=prod.sku, unit_cost=float(ln["unit_cost"]), quantity=ln["quantity"]))
    supplier_id = uuid.UUID(p["supplier_id"]) if p.get("supplier_id") else None
    if supplier_id:
        ok = (await ctx.db.execute(select(func.count()).select_from(Supplier).where(Supplier.id == supplier_id, Supplier.tenant_id == ctx.tenant_id))).scalar_one()
        if not ok:
            raise ValidationError("That supplier no longer exists")
    po = await purchase_service.create_purchase(
        ctx.db, ctx.tenant_id, ctx.user.id, PurchaseCreate(status="Draft", supplier_id=supplier_id, items=items), active_branch_id=ctx.branch_id,
    )
    return {"kind": "purchase_order", "reference": po.reference, "href": "/procurement/orders", "message": f"Draft purchase order {po.reference} created."}


async def _send_reminder(ctx: ToolContext, action: AiAction) -> dict[str, Any]:
    cid = uuid.UUID(action.payload["customer_id"])
    customer = (await ctx.db.execute(select(Customer).where(Customer.id == cid, Customer.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if customer is None or not customer.email:
        raise ValidationError("That customer no longer has an email address on file")
    invoices = await _open_invoices(ctx, cid)
    if not invoices:
        raise ValidationError(f"{customer.name} no longer owes anything, so no reminder was sent")
    recent = (await ctx.db.execute(select(func.count()).select_from(AiAction).where(
        AiAction.tenant_id == ctx.tenant_id, AiAction.kind == "payment_reminder", AiAction.status == "confirmed",
        AiAction.payload["customer_id"].astext == str(cid), AiAction.confirmed_at > datetime.now(UTC) - REMINDER_COOLDOWN,
    ))).scalar_one()
    if recent:
        raise ValidationError(f"A reminder was already sent to {customer.name} in the last 24 hours")
    business = (await ctx.db.execute(select(Tenant.name).where(Tenant.id == ctx.tenant_id))).scalar_one()
    subject, body = _reminder_message(business, customer.name, invoices, ctx.base_currency)   # rebuilt from live data, not the stale preview
    paragraphs = "".join(f"<p>{html.escape(p).replace(chr(10), '<br>')}</p>" for p in body.split("\n\n"))
    sent = await send_email(customer.email, subject, _branded_html(subject, paragraphs), body, reply_to=ctx.user.email, sender="accounts")
    if not sent:   # email not configured or failed: say so, record nothing as sent, leave the draft pending for a retry
        raise AppError("The email could not be sent (email isn't configured or the mail server refused it). Nothing was sent.", 502)
    return {"kind": "payment_reminder", "reference": customer.name, "href": "/accounting/invoices", "message": f"Reminder emailed to {customer.name}."}
