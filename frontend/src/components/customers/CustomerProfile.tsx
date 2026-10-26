"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useCustomerProfile, useCustomerRecords } from "@/lib/api/hooks";
import type { CustomerSection, CustomerSectionPage } from "@/lib/api/sales";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { BranchFilter, FinancialError } from "@/components/accounting/FinancialShared";

type Row = CustomerSectionPage["items"][number];
const date = (v: unknown) => v ? new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(String(v).slice(0, 10) + "T00:00:00Z")) : "–";
const COLUMNS: Record<CustomerSection, { label: string; cell: (row: Row, money: (v: unknown, c?: unknown) => string) => React.ReactNode; right?: boolean }[]> = {
  orders: [
    { label: "Order", cell: r => r.order_number }, { label: "Date", cell: r => date(r.ordered_at) }, { label: "Status", cell: r => r.status },
    { label: "Total", right: true, cell: (r, m) => m(r.total, r.currency) }, { label: "Paid", right: true, cell: (r, m) => m(r.amount_paid, r.currency) }, { label: "Due", cell: r => date(r.due_date) },
  ],
  payments: [
    { label: "Reference", cell: r => r.reference }, { label: "Date", cell: r => date(r.paid_at) }, { label: "Order", cell: r => r.order_number },
    { label: "Method", cell: r => r.payment_method ?? "–" }, { label: "Status", cell: r => r.status }, { label: "Amount", right: true, cell: (r, m) => m(r.amount, r.currency) },
  ],
  returns: [
    { label: "Return", cell: r => r.return_number }, { label: "Date", cell: r => date(r.return_date) }, { label: "Status", cell: r => r.status },
    { label: "Reason", cell: r => r.reason ?? "–" }, { label: "Refund", right: true, cell: (r, m) => m(r.refund_amount, r.currency) },
  ],
  debts: [
    { label: "Reference", cell: r => r.reference }, { label: "Issued", cell: r => date(r.issue_date) }, { label: "Due", cell: r => date(r.due_date) },
    { label: "Original", right: true, cell: (r, m) => m(r.original, r.currency) }, { label: "Paid", right: true, cell: (r, m) => m(r.paid, r.currency) },
    { label: "Outstanding", right: true, cell: (r, m) => m(r.outstanding, r.currency) },
    { label: "Status", cell: r => r.is_overdue ? "Overdue" : r.status === "WrittenOff" ? "Written off" : r.status === "PartiallyPaid" ? "Partially paid" : r.status },
  ],
};
const TITLES: Record<CustomerSection, string> = { orders: "Sales", payments: "Payments", returns: "Returns", debts: "Debts" };

export function CustomerProfileScreen({ id }: { id: string }) {
  const { user, activeBranchId } = useAuth();
  const { currency } = useAppConfig();
  const query = useCustomerProfile(id, activeBranchId, user?.tenantId);
  const money = (value: unknown, code?: unknown) => formatMoney(Number(value ?? 0), String(code ?? query.data?.currency ?? currency), { showCode: true });
  const [tab, setTab] = useState<CustomerSection>("orders");
  if (query.isLoading) return <PageLoader variant="page" />;
  if (query.error || !query.data) return <div className="space-y-3"><FinancialError error={query.error} /><Link href="/customers" className="text-xs font-semibold text-accent">Back to customers</Link></div>;
  const { customer, summary, sections, deals } = query.data;
  const visible = (Object.keys(sections) as CustomerSection[]).filter(key => sections[key]);
  const active = visible.includes(tab) ? tab : visible[0];
  const tiles = [
    summary.lifetime_sales !== undefined && { label: "Lifetime sales", value: money(summary.lifetime_sales) },
    summary.outstanding !== undefined && { label: "Outstanding", value: money(summary.outstanding), warn: Number(summary.outstanding) > 0 },
    summary.overdue !== undefined && { label: "Overdue", value: money(summary.overdue), danger: Number(summary.overdue) > 0 },
    summary.refunded !== undefined && { label: `Refunded (${summary.returns})`, value: money(summary.refunded) },
    summary.completed_orders !== undefined && { label: "Orders", value: String(summary.completed_orders) },
    summary.last_order_at !== undefined && { label: "Last order", value: date(summary.last_order_at) },
    deals !== null && { label: "Deals", value: String(deals) },
  ].filter(Boolean) as { label: string; value: string; warn?: boolean; danger?: boolean }[];
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div>
      <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground"><ArrowLeft size={12} />Customers</Link>
      <h1 className="pesaa-page-title">{query.data.name}</h1>
      {customer && <p className="mt-1 text-[12px] text-muted">{customer.customer_type === "business" ? "Business" : "Individual"} · {customer.is_active ? "Active" : "Inactive"} · Customer since {date(customer.created_at)}</p>}
    </div><div className="flex items-center gap-2"><div className="w-40"><BranchFilter /></div>{sections.debts && <Link href={`/debts/statements?kind=receivable&party=${id}`}><Button variant="secondary">Account statement</Button></Link>}</div></header>
    {customer && <section aria-label="Contact details" className="grid gap-3 rounded-xl border border-border bg-card p-4 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
      <p className="flex items-center gap-2"><Mail size={14} className="text-muted" aria-hidden />{customer.email ? <a className="truncate hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a> : <span className="text-muted">No email</span>}</p>
      <p className="flex items-center gap-2"><Phone size={14} className="text-muted" aria-hidden />{customer.phone ? <a className="hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a> : <span className="text-muted">No phone</span>}</p>
      <p className="flex items-start gap-2 sm:col-span-2"><MapPin size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden /><span className={customer.address ? "" : "text-muted"}>{customer.address || "No address"}</span></p>
      {customer.credit_daily_limit && <p className="sm:col-span-4 text-muted">Daily credit limit: {money(customer.credit_daily_limit)}</p>}
    </section>}
    {tiles.length > 0 && <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(t => <div key={t.label} className="min-w-0 rounded-xl border border-border bg-card p-4"><dt className="text-[11px] text-muted">{t.label}</dt><dd className={`mt-1 break-words text-[17px] font-bold tabular-nums ${t.danger ? "text-red-600" : t.warn ? "text-amber-600" : ""}`}>{t.value}</dd></div>)}</dl>}
    {!active ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">You don’t have permission to view this customer’s sales, payments, returns or debts.</p> : <section className="rounded-xl border border-border bg-card">
      <div role="tablist" aria-label="Customer records" className="flex overflow-x-auto border-b border-border" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const next = visible[(visible.indexOf(active) + (event.key === "ArrowRight" ? 1 : visible.length - 1)) % visible.length];
        setTab(next); event.currentTarget.querySelector<HTMLElement>(`#cust-tab-${next}`)?.focus();
      }}>{visible.map(key => <button key={key} id={`cust-tab-${key}`} role="tab" type="button" aria-selected={active === key} aria-controls={`cust-panel-${key}`} tabIndex={active === key ? 0 : -1} onClick={() => setTab(key)}
        className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold ${active === key ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>{TITLES[key]} <span className="text-muted">({sections[key]!.total})</span></button>)}</div>
      <SectionTable key={active} id={id} section={active} initial={sections[active]!} money={money} branch={activeBranchId} tenant={user?.tenantId} />
    </section>}
  </div>;
}

function SectionTable({ id, section, initial, money, branch, tenant }: { id: string; section: CustomerSection; initial: CustomerSectionPage; money: (v: unknown, c?: unknown) => string; branch: string | null; tenant?: string | null }) {
  const [page, setPage] = useState(1);
  const more = useCustomerRecords(id, section, page, branch, page > 1, tenant);
  const data = page === 1 ? initial : more.data;
  const columns = COLUMNS[section];
  const pages = Math.max(1, Math.ceil(initial.total / 10));
  return <div role="tabpanel" id={`cust-panel-${section}`} aria-labelledby={`cust-tab-${section}`} tabIndex={0} className="outline-offset-4">
    {more.error && <FinancialError error={more.error} />}
    {!data ? <div className="p-5"><PageLoader variant="compact" /></div> : !data.items.length ? <p className="px-5 py-12 text-center text-sm text-muted">No {TITLES[section].toLowerCase()} recorded for this customer{branch ? " in this branch" : ""}.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[12px]">
      <caption className="sr-only">{TITLES[section]}</caption>
      <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted"><tr>{columns.map(c => <th key={c.label} scope="col" className={`px-4 py-3 font-medium ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{data.items.map(row => <tr key={String(row.id)}>{columns.map(c => <td key={c.label} className={`whitespace-nowrap px-4 py-3 tabular-nums ${c.right ? "text-right" : ""}`}>{c.cell(row, money)}</td>)}</tr>)}</tbody>
    </table></div>}
    {pages > 1 && <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted"><span>{initial.total} records · Page {page} of {pages}</span><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
  </div>;
}
