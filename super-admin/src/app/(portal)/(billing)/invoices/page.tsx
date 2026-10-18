"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { useBilling } from "@/lib/billing/store";
import { formatMoney } from "@/lib/billing/money";
import { Badge, EmptyState, fmtDate, Metric, PageHeader, Pagination, SearchBox, usePaged } from "@/components/billing/ui";

const PAGE = 10;

function Inner() {
  const { state } = useBilling();
  const params = useSearchParams();
  const [f, setF] = useState({ q: params.get("tenant") ?? "", status: "all" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const all = state!.invoices;
  const rows = useMemo(() => {
    const k = f.q.trim().toLowerCase();
    return all.filter((i) => (f.status === "all" || i.status === f.status) && (!k || `${i.number} ${i.tenantName}`.toLowerCase().includes(k))).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [all, f]);
  const { page, slice, setPage } = usePaged(rows, PAGE, JSON.stringify(f));
  const outstanding: Record<string, number> = {};
  for (const i of all) if (i.status === "open" || i.status === "uncollectible") outstanding[i.currency] = (outstanding[i.currency] ?? 0) + (i.total - i.paid);

  return (
    <div className="space-y-5">
      <PageHeader title="Invoices" subtitle="Invoices are frozen when issued — later price changes never alter them." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Invoices" value={all.length} />
        <Metric label="Paid" value={all.filter((i) => i.status === "paid").length} />
        <Metric label="Open" value={all.filter((i) => i.status === "open").length} />
        <Metric label="Outstanding" value={Object.keys(outstanding).length ? Object.entries(outstanding).map(([c, v]) => <div key={c} className="text-base leading-tight">{formatMoney(v, c)}</div>) : "—"} sub="Per currency" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} onChange={(v) => set("q", v)} placeholder="Search number or tenant" />
        <Select aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value)} className="w-auto! min-w-[130px]"><option value="all">All statuses</option><option value="paid">Paid</option><option value="open">Open</option><option value="void">Void</option><option value="uncollectible">Uncollectible</option><option value="draft">Draft</option></Select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? <EmptyState title="No invoices match" hint="Clear a filter or search to see more." /> : (
          <TableScroll label="Invoices"><table className="w-full min-w-[920px] text-left text-[13px]">
            <thead><tr className="border-b border-border bg-surface/30 text-[11px] uppercase tracking-wider text-muted">{["Invoice", "Tenant", "Period", "Issued", "Due", "Total", "Paid", "Outstanding", "Status"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {slice.map((i) => (
                <tr key={i.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3"><Link href={`/invoices/${i.id}`} className="font-mono text-[12px] font-semibold hover:text-accent">{i.number}</Link></td>
                  <td className="px-4 py-3 font-semibold">{i.tenantName}</td>
                  <td className="px-4 py-3 text-[12px]">{fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}</td>
                  <td className="px-4 py-3 text-[12px]">{fmtDate(i.issuedAt)}</td>
                  <td className="px-4 py-3 text-[12px]">{fmtDate(i.dueAt)}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(i.total, i.currency)}</td>
                  <td className="px-4 py-3">{formatMoney(i.paid, i.currency)}</td>
                  <td className="px-4 py-3">{formatMoney(i.status === "void" ? 0 : i.total - i.paid, i.currency)}</td>
                  <td className="px-4 py-3"><Badge value={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
    </div>
  );
}

export default function InvoicesPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
