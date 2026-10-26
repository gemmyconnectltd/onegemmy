"""Customer reminders and statements by email, through the shared mail channel (core.email). A customer with no email on
file is reported as skipped, never silently dropped. Nothing is sent from a payables list: those are our own debts."""
import asyncio
import html
import os
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_email_message
from app.core.exceptions import ValidationError
from app.modules.accounting.repository.debt import DebtRepository
from app.modules.accounting.service import debt as base
from app.modules.accounting.service.debt_export import export_statement
from app.modules.accounting.service.debt_statement import statement
from app.modules.audit.service import record_audit
from app.modules.sales.models.customer import Customer
from app.modules.tenants.models.tenant import Tenant
from app.modules.tenants.models.user import User


async def remind(db: AsyncSession, user: User, active, ids: list[uuid.UUID], message: str) -> dict:
    tenant = base.allow(user, "accounts_receivable", "update")
    _, branch, currency = await base.context(db, user, "receivable", active)
    repo = DebtRepository(db)
    projection = repo.projection(tenant, "receivable", currency, branch, datetime.now(UTC).date()).subquery()
    rows = [dict(r) for r in (await db.execute(select(projection).where(
        projection.c.id.in_(ids), projection.c.outstanding > 0))).mappings()]
    if not rows:
        raise ValidationError("None of the selected debts has an outstanding balance")
    business = (await db.execute(select(Tenant.name).where(Tenant.id == tenant))).scalar_one()
    by_party: dict = defaultdict(list)
    for r in rows:
        by_party[r["party_id"]].append(r)
    sent, skipped = 0, []
    for party_id, items in by_party.items():
        customer = (await db.execute(select(Customer).where(Customer.tenant_id == tenant, Customer.id == party_id))).scalar_one_or_none() \
            if party_id else None
        if customer is None or not customer.email:
            skipped.append({"name": items[0]["name"], "reason": "No email address on file"})
            continue
        lines = "".join(
            f"<tr><td style='padding:4px 12px 4px 0'>{html.escape(i['reference'])}</td>"
            f"<td style='padding:4px 12px 4px 0'>{html.escape(str(i['due_date'] or '-'))}</td>"
            f"<td style='padding:4px 0;text-align:right'>{Decimal(i['outstanding']):,.2f} {html.escape(i['currency'])}</td></tr>"
            for i in items)
        body = (f"<p>Dear {html.escape(customer.name)},</p><p>This is a friendly reminder from {html.escape(business)} that the "
                f"following amounts are outstanding:</p><table>{lines}</table>"
                + (f"<p>{html.escape(message)}</p>" if message else "") + "<p>Thank you.</p>")
        ok = await send_email_message(customer.email, f"Payment reminder from {business}", body)
        if ok:
            sent += 1
        else:
            skipped.append({"name": customer.name, "reason": "The mail server did not accept the message"})
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action="debt.receivable.remind",
                       entity_type="debt_receivable", entity_id=str(next(iter(ids))), summary=f"Sent {sent} payment reminder(s)",
                       changes={"sent": sent, "skipped": len(skipped), "documents": len(rows)})
    await db.commit()
    return {"sent": sent, "skipped": skipped}


async def send_statement(db: AsyncSession, user: User, active, party_id: uuid.UUID, date_from, date_to) -> dict:
    tenant = base.allow(user, "accounts_receivable", "update")
    data = await statement(db, user, "receivable", active, party_id, date_from, date_to)
    email = data["party"]["email"]
    if not email:
        raise ValidationError("This customer has no email address on file")
    business = (await db.execute(select(Tenant.name).where(Tenant.id == tenant))).scalar_one()
    path, filename, _ = await export_statement(db, user, "receivable", active, party_id, date_from, date_to, "pdf")
    try:
        content = await asyncio.to_thread(Path(path).read_bytes)
    finally:
        os.unlink(path)
    body = (f"<p>Dear {html.escape(data['party']['name'])},</p><p>Please find your account statement from {html.escape(business)} "
            f"for {data['date_from']} to {data['date_to']} attached. The balance at the end of the period is "
            f"{Decimal(data['closing']):,.2f} {html.escape(data['currency'])}.</p>")
    if not await send_email_message(email, f"Account statement from {business}", body, attachments=[(filename, "application/pdf", content)]):
        raise ValidationError("The mail server did not accept the message. Try again later.")
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action="debt.receivable.send_statement",
                       entity_type="debt_receivable", entity_id=str(party_id), summary=f"Sent statement to {data['party']['name']}",
                       changes={"date_from": str(data["date_from"]), "date_to": str(data["date_to"])})
    await db.commit()
    return {"sent": True}
