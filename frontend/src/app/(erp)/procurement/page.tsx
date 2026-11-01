"use client";
import { useState } from "react";
import Link from "next/link";
import { usePurchasingOverview, usePurchaseOrders } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { TableWrap } from "@/components/ui/Table";
import { PurchaseHeader, PurchaseStatus, usePurchasingScope } from "@/components/procurement/PurchaseShared";

export default function PurchasingOverview() {
  const scope = usePurchasingScope(), {currency} = useAppConfig(), {hasPermission} = useAuth();
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const filters = {from_date: from, to_date: to};
  const summary = usePurchasingOverview(filters, scope), recent = usePurchaseOrders(undefined, 1, 5, undefined, filters, scope);
  const counts = summary.data?.counts || {};
  return <div className="space-y-5"><PurchaseHeader title="Purchases Overview" description="Supplier commitments, delivery progress and outstanding receipt liabilities." actions={<>{hasPermission("purchase_orders:create") && <Link href="/procurement/orders/new"><Button>Create Purchase Order</Button></Link>}<Link href="/reports/operations"><Button variant="outline">Operational reports</Button></Link></>} />
    <div className="flex flex-wrap items-end gap-3"><label className="text-xs text-muted">Order date from<Input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label><label className="text-xs text-muted">Order date to<Input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label><Button variant="ghost" onClick={() => {setFrom(""); setTo("");}}>All history</Button></div>
    <p className="text-xs text-muted">Branch scope follows the top bar. Purchase values are commitments; they are not cash expenditure.</p>
    {summary.isLoading ? <PageLoader variant="compact" /> : summary.error ? <FinancialError error={summary.error} /> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[["Purchase orders", summary.data?.total || 0], ["Awaiting approval", counts.PendingApproval || 0], ["Awaiting delivery", (counts.Approved || 0) + (counts.Sent || 0)], ["Partially received", counts.PartiallyReceived || 0], ["Received", counts.Received || 0], ["Drafts", counts.Draft || 0]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>
      <div className="grid gap-4 md:grid-cols-2">{[["Purchase commitments", summary.data?.commitments], ["Outstanding supplier bills", summary.data?.outstanding]].map(([title, values]) => <section key={String(title)} className="space-y-3 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">{String(title)}</h2>{Array.isArray(values) && values.length ? values.map(item => <p key={item.currency_code || currency} className="font-semibold tabular-nums">{formatMoney(Number(item.amount), item.currency_code || currency, {showCode: true})}</p>) : <p className="text-sm text-muted">No amounts in this period.</p>}</section>)}</div>
    </>}
    <section className="space-y-3"><div className="flex justify-between"><h2 className="pesaa-card-title">Recent purchase orders</h2><Link className="text-sm text-accent hover:underline" href="/procurement/orders">View all</Link></div>{recent.isLoading ? <PageLoader variant="compact" /> : recent.error ? <FinancialError error={recent.error} /> : <TableWrap><table className="w-full min-w-[640px] text-left text-sm"><thead><tr>{["PO number", "Supplier", "Expected delivery", "Amount", "Status"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{recent.data?.items.map(order => <tr key={order.id}><td className="p-4"><Link href={`/procurement/orders/${order.id}`} className="font-semibold text-accent hover:underline">{order.reference}</Link></td><td className="p-4">{order.supplier?.name || "—"}</td><td className="p-4">{fmtDate(order.expected_date)}</td><td className="p-4 text-right tabular-nums">{formatMoney(order.total, order.currency_code || currency, {showCode: true})}</td><td className="p-4"><PurchaseStatus status={order.status} /></td></tr>)}</tbody></table></TableWrap>}{!recent.isLoading && !recent.error && !recent.data?.items.length && <p className="text-sm text-muted">No purchase orders in this period.</p>}</section>
  </div>;
}
