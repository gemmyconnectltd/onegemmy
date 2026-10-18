"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { useBilling } from "@/lib/billing/store";
import { mrrByCurrency, subscriptionCost } from "@/lib/billing/logic";
import { formatMoney } from "@/lib/billing/money";
import type { Subscription } from "@/lib/billing/types";
import { Badge, EmptyState, fmtDate, Metric, PageHeader, Pagination, SearchBox, SortHeader, usePaged } from "@/components/billing/ui";

type SortKey = "tenant" | "total" | "next";
const PAGE = 10;

export default function SubscriptionsPage() {
  const { state } = useBilling();
  const subs = state!.subscriptions;
  const plans = state!.plans;
  const [f, setF] = useState({ q: "", plan: "all", status: "all", country: "all", cycle: "all" });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "tenant", dir: "asc" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const countries = useMemo(() => Array.from(new Set(subs.map((s) => s.country))).sort(), [subs]);
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const rows = useMemo(() => {
    const k = f.q.trim().toLowerCase();
    const list = subs.filter((s) => (f.plan === "all" || s.planId === f.plan) && (f.status === "all" || s.status === f.status) && (f.country === "all" || s.country === f.country) && (f.cycle === "all" || s.cycle === f.cycle) && (!k || s.tenantName.toLowerCase().includes(k)));
    const val = (s: Subscription): number | string => sort.key === "tenant" ? s.tenantName.toLowerCase() : sort.key === "total" ? subscriptionCost(s).total : s.nextBillingDate ?? "9999";
    return [...list].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (sort.dir === "asc" ? 1 : -1));
  }, [subs, f, sort]);
  const { page, slice, setPage } = usePaged(rows, PAGE, JSON.stringify(f) + sort.key + sort.dir);
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const th = (key: SortKey, label: string) => <SortHeader label={label} active={sort.key === key} dir={sort.dir} onClick={() => toggle(key)} />;
  const plain = (label: string, cls = "") => <th scope="col" className={`px-4 py-3 font-semibold uppercase tracking-wider ${cls}`}>{label}</th>;

  const count = (st: Subscription["status"]) => subs.filter((s) => s.status === st).length;
  const mrr = Object.entries(mrrByCurrency(subs));

  return (
    <div className="space-y-5">
      <PageHeader title="Subscriptions" subtitle="Every tenant's plan, seats and billing state." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Total" value={subs.length} />
        <Metric label="Active" value={count("active")} />
        <Metric label="In trial" value={count("trialing")} />
        <Metric label="Past due" value={count("past_due")} />
        <Metric label="Canceled" value={count("canceled")} />
        <Metric label="MRR" value={mrr.length ? mrr.map(([c, v]) => <div key={c} className="text-base leading-tight">{formatMoney(v, c)}</div>) : "—"} sub="Per currency, not combined" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} onChange={(v) => set("q", v)} placeholder="Search tenant" />
        <Select aria-label="Plan" value={f.plan} onChange={(e) => set("plan", e.target.value)} className="w-auto! min-w-[120px]"><option value="all">All plans</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value)} className="w-auto! min-w-[120px]"><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trial</option><option value="past_due">Past due</option><option value="canceled">Canceled</option></Select>
        <Select aria-label="Country" value={f.country} onChange={(e) => set("country", e.target.value)} className="w-auto! min-w-[120px]"><option value="all">All countries</option>{countries.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Billing period" value={f.cycle} onChange={(e) => set("cycle", e.target.value)} className="w-auto! min-w-[120px]"><option value="all">Any period</option><option value="monthly">Monthly</option><option value="annual">Annual</option></Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? <EmptyState title="No subscriptions match" hint="Clear a filter or search to see more." /> : (
          <TableScroll label="Subscriptions"><table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead><tr className="border-b border-border bg-surface/30 text-[11px] text-muted">
              {th("tenant", "Tenant")}{plain("Plan")}{plain("Cycle")}{plain("Users")}{plain("Branches")}{th("total", "Recurring")}{th("next", "Next billing")}{plain("Payment")}{plain("Status")}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {slice.map((s) => (
                <tr key={s.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3"><Link href={`/subscriptions/${s.id}`} className="font-semibold text-foreground hover:text-accent">{s.tenantName}</Link><p className="text-[11px] text-muted">{s.country}</p></td>
                  <td className="px-4 py-3">{planName(s.planId)}</td>
                  <td className="px-4 py-3 capitalize">{s.cycle}</td>
                  <td className="px-4 py-3">{s.includedUsers}{s.extraUsers > 0 && <span className="text-muted"> +{s.extraUsers}</span>}</td>
                  <td className="px-4 py-3">{s.includedBranches}{s.extraBranches > 0 && <span className="text-muted"> +{s.extraBranches}</span>}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(subscriptionCost(s).total, s.currency)}<span className="ml-1 text-[11px] font-normal text-muted">{s.currency}</span></td>
                  <td className="px-4 py-3 text-[12px]">{fmtDate(s.nextBillingDate)}</td>
                  <td className="px-4 py-3"><Badge value={s.paymentStatus} /></td>
                  <td className="px-4 py-3"><Badge value={s.status} />{s.cancelAtPeriodEnd && <span className="ml-1 text-[10px] text-amber-600">ends soon</span>}</td>
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
