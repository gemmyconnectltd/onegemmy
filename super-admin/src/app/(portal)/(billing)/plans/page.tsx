"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, Crown, Pencil, Plus, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAdminStats } from "@/lib/api/hooks";
import { useBilling } from "@/lib/billing/store";
import { formatMoney } from "@/lib/billing/money";
import { subscriberCount, SUPPORT_LABEL } from "@/lib/billing/logic";
import type { Plan } from "@/lib/billing/types";
import { Badge, EmptyState, fmtDate, PageHeader, Pagination, SearchBox, SortHeader, usePaged } from "@/components/billing/ui";

type SortKey = "name" | "monthly" | "subs" | "updated";
const PAGE = 8;

export default function PlansPage() {
  const { state, actions } = useBilling();
  const stats = useAdminStats({ retry: false });
  const { confirm, dialog } = useConfirmDialog();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updated", dir: "desc" });
  const plans = state!.plans;
  const subs = state!.subscriptions;

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = plans.filter((p) => (status === "all" || p.status === status) && (!k || `${p.name} ${p.description}`.toLowerCase().includes(k)));
    const val = (p: Plan): number | string => sort.key === "name" ? p.name.toLowerCase() : sort.key === "monthly" ? p.prices.monthlyPrice : sort.key === "subs" ? subscriberCount(p.id, subs) : p.updatedAt;
    return [...list].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (sort.dir === "asc" ? 1 : -1));
  }, [plans, subs, q, status, sort]);
  const { page, slice, setPage } = usePaged(rows, PAGE, `${q}|${status}|${sort.key}|${sort.dir}`);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const th = (key: SortKey, label: string, cls?: string) => <SortHeader label={label} active={sort.key === key} dir={sort.dir} onClick={() => toggleSort(key)} className={cls} />;

  const archive = (p: Plan) => {
    const n = subscriberCount(p.id, subs);
    confirm({ title: `Archive ${p.name}?`, message: n ? `${n} active subscriber${n === 1 ? "" : "s"} will keep this plan and their prices, but no one new can choose it.` : "No one new will be able to choose this plan.", confirmLabel: "Archive", danger: true, onConfirm: () => actions.setPlanStatus(p.id, "archived") });
  };

  const live = stats.data?.plans;

  return (
    <div className="space-y-5">
      <PageHeader title="Plans" subtitle="The catalogue customers subscribe to. Price edits apply to new subscribers only."
        actions={<Link href="/plans/new"><Button variant="primary"><Plus size={14} /> Create plan</Button></Link>} />

      {plans.length === 0 ? <div className="rounded-xl border border-border bg-card"><EmptyState title="No plans yet" hint="Create your first plan to start selling subscriptions." action={<Link href="/plans/new"><Button variant="primary">Create plan</Button></Link>} /></div> : (<>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.filter((p) => p.status !== "archived").map((p) => {
            const c = p.prices.currency;
            const n = subscriberCount(p.id, subs);
            return (
              <article key={p.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10"><Crown size={16} className="text-accent" /></span>
                    <div className="min-w-0"><h2 className="truncate text-sm font-bold text-foreground">{p.name}</h2><Badge value={p.status} /></div>
                  </div>
                  <Link href={`/plans/${p.id}/edit`} aria-label={`Edit ${p.name}`} className="rounded-lg border border-border p-1.5 text-muted hover:text-foreground"><Pencil size={13} /></Link>
                </div>
                <p className="mt-2 line-clamp-2 min-h-[2.2em] text-[12px] text-muted">{p.description}</p>
                <p className="mt-3 text-2xl font-extrabold text-foreground">{formatMoney(p.prices.monthlyPrice, c)}<span className="text-[12px] font-medium text-muted"> /mo</span></p>
                <p className="text-[11.5px] text-muted">{formatMoney(p.prices.annualPrice, c)} /yr</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                  <dt className="text-muted">Users</dt><dd className="text-right font-semibold">{p.includedUsers} <span className="font-normal text-muted">+{formatMoney(p.prices.extraUserPrice, c)}</span></dd>
                  <dt className="text-muted">Branches</dt><dd className="text-right font-semibold">{p.includedBranches} <span className="font-normal text-muted">+{formatMoney(p.prices.extraBranchPrice, c)}</span></dd>
                  <dt className="text-muted">Products</dt><dd className="text-right font-semibold">{p.limits.maxProducts?.toLocaleString() ?? "Unlimited"}</dd>
                  <dt className="text-muted">Support</dt><dd className="text-right font-semibold">{SUPPORT_LABEL[p.supportLevel]}</dd>
                  <dt className="text-muted">Subscribers</dt><dd className="text-right font-semibold">{n}</dd>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">{p.modules.map((m) => <span key={m} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">{m}</span>)}</div>
              </article>
            );
          })}
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-bold text-foreground">All plans</h2>
            <SearchBox value={q} onChange={setQ} placeholder="Search plans" />
            <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto! min-w-[130px]"><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></Select>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {rows.length === 0 ? <EmptyState title="No plans match" hint="Try a different search or filter." /> : (
              <TableScroll label="Plans"><table className="w-full min-w-[760px] text-left text-[13px]">
                <thead><tr className="border-b border-border bg-surface/30 text-[11px] text-muted">
                  {th("name", "Plan")}{th("monthly", "Monthly / annual")}<th scope="col" className="px-4 py-3 font-semibold uppercase tracking-wider">Users / branches</th>{th("subs", "Subscribers")}<th scope="col" className="px-4 py-3 font-semibold uppercase tracking-wider">Status</th>{th("updated", "Updated")}<th scope="col" aria-label="Actions" className="px-4 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {slice.map((p) => (
                    <tr key={p.id} className="hover:bg-surface/40">
                      <td className="px-4 py-3"><p className="font-semibold text-foreground">{p.name}</p><p className="text-[11px] text-muted">v{p.prices.version} · {p.prices.currency}</p></td>
                      <td className="px-4 py-3">{formatMoney(p.prices.monthlyPrice, p.prices.currency)} <span className="text-muted">/ {formatMoney(p.prices.annualPrice, p.prices.currency)}</span></td>
                      <td className="px-4 py-3">{p.includedUsers} / {p.includedBranches}</td>
                      <td className="px-4 py-3">{subscriberCount(p.id, subs)}</td>
                      <td className="px-4 py-3"><Badge value={p.status} /></td>
                      <td className="px-4 py-3 text-[12px] text-muted">{fmtDate(p.updatedAt)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1">
                        <Link href={`/plans/${p.id}/edit`} aria-label={`Edit ${p.name}`} className="rounded-md border border-border p-1.5 text-muted hover:text-foreground"><Pencil size={13} /></Link>
                        <button type="button" aria-label={`Duplicate ${p.name}`} onClick={() => actions.duplicatePlan(p.id)} className="rounded-md border border-border p-1.5 text-muted hover:text-foreground"><Copy size={13} /></button>
                        {p.status === "archived"
                          ? <button type="button" aria-label={`Restore ${p.name}`} onClick={() => actions.setPlanStatus(p.id, "active")} className="rounded-md border border-border p-1.5 text-muted hover:text-foreground"><RotateCcw size={13} /></button>
                          : <button type="button" aria-label={`Archive ${p.name}`} onClick={() => archive(p)} className="rounded-md border border-border p-1.5 text-muted hover:text-red-600"><Archive size={13} /></button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table></TableScroll>
            )}
          </div>
          <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
        </section>
      </>)}

      {live && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-foreground">Live tenants by current plan</h2><Link href="/tenants" className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">Tenants <ArrowUpRight size={12} /></Link></div>
          <p className="mt-0.5 text-[12px] text-muted">Real data from the platform (tenant plan field). Billing records above are demo data until the billing API exists.</p>
          <div className="mt-3 flex flex-wrap gap-2">{Object.entries(live).map(([k, v]) => <span key={k} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[12px]"><span className="font-semibold capitalize">{k}</span> · {v}</span>)}</div>
        </section>
      )}
      {dialog}
    </div>
  );
}
