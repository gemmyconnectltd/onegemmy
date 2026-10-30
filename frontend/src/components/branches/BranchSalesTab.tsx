"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/lazy";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card, Stat } from "@/components/branches/parts";
import { useBranchSales } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { growthText, presetRange, type PeriodPreset } from "@/lib/branchView";
import { fmtMoney } from "@/lib/config";
import { useWorkInBranch } from "@/lib/useWorkInBranch";

const PRESETS: { id: PeriodPreset; label: string }[] = [{ id: "today", label: "Today" }, { id: "week", label: "Last 7 days" }, { id: "month", label: "This month" }, { id: "custom", label: "Custom" }];
const GROWTH_TONE = { up: "text-emerald-600", down: "text-red-600", flat: "text-muted", none: "text-muted" } as const;

export function BranchSalesTab({ branchId }: { branchId: string }) {
  const { currencySymbol, theme, brandColor } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const main = theme === "dark" ? "#2dd4bf" : brandColor; // same line colour as the other charts: the business's brand colour
  const open = useWorkInBranch(branchId);
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = useMemo(() => (preset === "custom" ? (custom.from && custom.to && custom.from <= custom.to ? custom : null) : presetRange(preset)), [preset, custom]);
  const q = useBranchSales(branchId, range?.from, range?.to, { enabled: !!range });
  const money = (v: number) => fmtMoney(v, currencySymbol);
  const d = q.data;
  const growth = growthText(d?.growth_pct);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Reporting period" className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {PRESETS.map((p) => <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${preset === p.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}>{p.label}</button>)}
        </div>
        {preset === "custom" && <div className="flex items-center gap-2"><Input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-auto" /><span className="text-muted">to</span><Input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-auto" /></div>}
        <div className="ml-auto flex gap-2"><Button variant="secondary" size="sm" onClick={() => open("/sales/orders")}>View sales</Button><Button variant="outline" size="sm" onClick={() => open("/reports/daily")}>Open reports</Button></div>
      </div>
      {preset === "custom" && !range && <p className="text-[13px] text-muted">Choose a start and an end date (the start can&apos;t be after the end).</p>}

      {q.isLoading && range ? <PageLoader variant="compact" /> : q.isError ? (
        <p role="alert" className="rounded-xl border border-border bg-card py-12 text-center text-sm text-red-600">{(q.error as { status?: number } | null)?.status === 403 ? "You don't have access to sales for this branch, or the Sales module isn't on." : "Couldn't load sales for this branch."}</p>
      ) : d && (
        <>
          <p className="text-[12px] text-muted">{d.from_date} to {d.to_date} · compared with {d.previous.from_date} to {d.previous.to_date}</p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Total sales" value={money(d.sales)} sub={<span className={GROWTH_TONE[growth.tone]}>{growth.text}</span>} />
            <Stat label="Transactions" value={d.orders} sub={`${d.previous.orders} in the previous period`} />
            <Stat label="Average transaction" value={d.orders ? money(d.average) : "—"} />
            <Stat label="Previous period" value={money(d.previous.sales)} sub="Completed orders" />
          </div>
          <Card title="Sales trend" hint="Completed orders per day">
            {d.trend.length === 0 ? <p className="py-10 text-center text-sm text-muted">No sales in this period.</p> : (
              <div className="h-56" role="img" aria-label="Daily sales for the period">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip contentStyle={c.tooltip} formatter={(v) => money(Number(v))} />
                    <Area type="monotone" dataKey="sales" stroke={main} strokeWidth={2} fill={main} fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top products" hint="By sales amount">
              {d.top_products.length === 0 ? <p className="py-4 text-center text-sm text-muted">Nothing sold in this period.</p> : <ul className="divide-y divide-border">{d.top_products.map((p) => <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate font-medium">{p.name}</span><span className="shrink-0 tabular-nums text-muted">{p.quantity} × · <span className="font-semibold text-foreground">{money(p.amount)}</span></span></li>)}</ul>}
            </Card>
            <Card title="Payment methods" hint="Payments received in this period">
              {d.payment_methods.length === 0 ? <p className="py-4 text-center text-sm text-muted">No payments in this period.</p> : <ul className="divide-y divide-border">{d.payment_methods.map((m) => <li key={m.method} className="flex items-center justify-between py-2 text-sm"><span className="font-medium capitalize">{m.method}</span><span className="tabular-nums font-semibold">{money(m.amount)}</span></li>)}</ul>}
            </Card>
          </div>
          <Card title="Recent transactions">
            {d.recent_orders.length === 0 ? <p className="py-4 text-center text-sm text-muted">No transactions in this period.</p> : <ul className="divide-y divide-border">{d.recent_orders.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div><span className="font-medium">{o.number}</span><span className="ml-2 text-[12px] text-muted">{o.at ? new Date(o.at).toLocaleString() : ""}{o.method ? ` · ${o.method}` : ""}</span></div><span className="tabular-nums font-semibold">{money(o.total)}</span></li>)}</ul>}
          </Card>
          <p className="text-[12px] text-muted">{d.definitions}</p>
        </>
      )}
    </div>
  );
}
