"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { useBilling } from "@/lib/billing/store";
import { formatMoney } from "@/lib/billing/money";
import type { Payment, PaymentStatus } from "@/lib/billing/types";
import { Badge, EmptyState, fmtDate, Metric, Notice, PageHeader, Pagination, SearchBox, usePaged } from "@/components/billing/ui";

const PAGE = 10;
const STATUSES: PaymentStatus[] = ["pending", "processing", "succeeded", "failed", "refunded"];

function Inner() {
  const { state } = useBilling();
  const params = useSearchParams();
  const [f, setF] = useState({ q: params.get("tenant") ?? "", status: "all", currency: "all" });
  const [open, setOpen] = useState<Payment | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const all = state!.payments;
  const currencies = useMemo(() => Array.from(new Set(all.map((p) => p.currency))).sort(), [all]);
  const rows = useMemo(() => {
    const k = f.q.trim().toLowerCase();
    return all.filter((p) => (f.status === "all" || p.status === f.status) && (f.currency === "all" || p.currency === f.currency) && (!k || `${p.tenantName} ${p.providerRef ?? ""} ${p.id}`.toLowerCase().includes(k))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [all, f]);
  const { page, slice, setPage } = usePaged(rows, PAGE, JSON.stringify(f));
  const count = (s: PaymentStatus) => all.filter((p) => p.status === s).length;
  const collected: Record<string, number> = {};
  for (const p of all) if (p.status === "succeeded") collected[p.currency] = (collected[p.currency] ?? 0) + p.amount;

  return (
    <div className="space-y-5">
      <PageHeader title="Payments" subtitle="Every charge attempt. A payment is only Succeeded once the payment provider confirms it." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STATUSES.map((s) => <Metric key={s} label={s} value={count(s)} />)}
        <Metric label="Collected" value={Object.keys(collected).length ? Object.entries(collected).map(([c, v]) => <div key={c} className="text-base leading-tight">{formatMoney(v, c)}</div>) : "—"} sub="Succeeded, per currency" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} onChange={(v) => set("q", v)} placeholder="Search tenant or reference" />
        <Select aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value)} className="w-auto! min-w-[130px]"><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</Select>
        <Select aria-label="Currency" value={f.currency} onChange={(e) => set("currency", e.target.value)} className="w-auto! min-w-[120px]"><option value="all">All currencies</option>{currencies.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? <EmptyState title="No payments match" hint="Clear a filter or search to see more." /> : (
          <TableScroll label="Payments"><table className="w-full min-w-[820px] text-left text-[13px]">
            <thead><tr className="border-b border-border bg-surface/30 text-[11px] uppercase tracking-wider text-muted">{["Date", "Tenant", "Amount", "Method", "Reference", "Status"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {slice.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface/40" onClick={() => setOpen(p)}>
                  <td className="px-4 py-3 text-[12px]">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-3 font-semibold"><button type="button" className="text-left hover:text-accent" onClick={() => setOpen(p)}>{p.tenantName}</button></td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(p.amount, p.currency)}<span className="ml-1 text-[11px] font-normal text-muted">{p.currency}</span></td>
                  <td className="px-4 py-3">{p.method}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px] text-muted">{p.providerRef ?? "awaiting provider"}</td>
                  <td className="px-4 py-3"><Badge value={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />

      <Drawer open={!!open} onClose={() => setOpen(null)} side="right" size="lg" title="Payment details" description={open?.id}>
        {open && (
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center justify-between"><p className="text-2xl font-extrabold">{formatMoney(open.amount, open.currency)}</p><Badge value={open.status} /></div>
            <dl className="text-[13px]">
              {[["Tenant", open.tenantName], ["Created", fmtDate(open.createdAt)], ["Method", open.method], ["Provider", open.provider], ["Provider reference", open.providerRef ?? "Not confirmed yet"], ...(open.refundedAmount ? [["Refunded", formatMoney(open.refundedAmount, open.currency)]] : []), ...(open.failureReason ? [["Failure reason", open.failureReason]] : [])].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-2"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words text-right font-semibold">{v}</dd></div>)}
            </dl>
            {(open.status === "pending" || open.status === "processing") && <Notice tone="blue">Waiting for the payment provider. This status changes only when the provider reports the outcome — it can&apos;t be set manually.</Notice>}
            <div className="flex flex-wrap gap-2">
              <Link href={`/subscriptions/${open.subscriptionId}`}><Button variant="outline">View subscription</Button></Link>
              {open.invoiceId && <Link href={`/invoices/${open.invoiceId}`}><Button variant="outline">View invoice</Button></Link>}
              <Button variant="outline" disabled title="Refunds need the billing API and a payment provider"><Info size={14} /> Refund</Button>
            </div>
            <p className="text-[11.5px] text-muted">Refunds are unavailable in demo mode: they require the billing API and a connected payment provider. Card numbers and provider secrets are never stored here.</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function PaymentsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
