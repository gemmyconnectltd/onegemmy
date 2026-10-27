"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Users, Boxes, Calculator, Briefcase, Truck, Factory, Wrench, ShoppingCart, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { EngagementCategory, UsagePeriod, UsageTenantRow } from "@/lib/api";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/date";
import { Select } from "@/components/ui/Form";
import { cn } from "@/lib/utils";

export const TIERS: EngagementCategory[] = ["dormant", "light", "moderate", "heavy"];
export const TIER_LABEL: Record<EngagementCategory, string> = { dormant: "Dormant", light: "Light", moderate: "Moderate", heavy: "Heavy" };
export const TIER_RULE: Record<EngagementCategory, string> = { dormant: "No orders", light: "1–9 orders", moderate: "10–49 orders", heavy: "50+ orders" };
export const MODULE_ICON: Record<string, LucideIcon> = { sales: ShoppingCart, inventory: Boxes, accounting: Calculator, hr: Users, procurement: Truck, manufacturing: Factory, crm: Briefcase, repairs: Wrench };
const PERIODS: { value: UsagePeriod; label: string }[] = [{ value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last 12 months" }, { value: "all", label: "All time" }];

export const fmtCount = (n: number) => n.toLocaleString();
export const fmtPct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
export const fmtWhen = (v: string | null | undefined) => (v ? fmtDateTime(v) : "No activity yet");
export { formatMoney };

/** Colour per engagement tier, from the shared chart palette so light and dark both read. */
export function useTierColors(): Record<EngagementCategory, string> {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  return { dormant: c.gray, light: c.gold, moderate: c.blue, heavy: c.primary };
}

/** `?period=` kept in the URL so a drill-down opens on the same scope as the page that linked to it. */
export function usePeriodParam(fallback: UsagePeriod) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("period");
  const period = (PERIODS.some((p) => p.value === raw) ? raw : fallback) as UsagePeriod;
  const set = (next: UsagePeriod) => router.replace(`${pathname}?period=${next}`, { scroll: false });
  return { period, set, query: `period=${period}` };
}

export function UsagePeriodSelect({ period, onChange }: { period: UsagePeriod; onChange: (p: UsagePeriod) => void }) {
  return <Select aria-label="Reporting period" className="w-auto!" value={period} onChange={(e) => onChange(e.target.value as UsagePeriod)}>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav aria-label="Breadcrumb" className="mb-2"><ol className="flex flex-wrap items-center gap-1 text-[12px] text-muted">{items.map((item, i) => <li key={item.label} className="flex items-center gap-1">{i > 0 && <ChevronRight size={12} aria-hidden />}{item.href ? <Link href={item.href} className="hover:text-foreground hover:underline">{item.label}</Link> : <span aria-current="page" className="font-semibold text-foreground">{item.label}</span>}</li>)}</ol></nav>;
}

export function UsageCard({ title, subtitle, action, children, className }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("min-w-0 rounded-xl border border-border bg-card p-5", className)}><div className="mb-4 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-sm font-bold">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function StatusPill({ status }: { status: UsageTenantRow["status"] | string }) {
  const tone = status === "active" ? "bg-accent/10 text-accent" : status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>{status}</span>;
}

export function TenantLink({ tenant, tab = "usage" }: { tenant: Pick<UsageTenantRow, "id" | "name">; tab?: string }) {
  return <Link href={`/tenants/${tenant.id}?tab=${tab}`} className="font-semibold text-accent hover:underline">{tenant.name}</Link>;
}

/** Stacked distribution bar + legend; every segment opens that tier's tenant list. */
export function EngagementDistribution({ counts, query = "" }: { counts: Record<EngagementCategory, number>; query?: string }) {
  const colors = useTierColors();
  const total = TIERS.reduce((s, t) => s + counts[t], 0);
  const suffix = query ? `?${query}` : "";
  return <div>
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface" role="img" aria-label={TIERS.map((t) => `${TIER_LABEL[t]} ${counts[t]}`).join(", ")}>
      {TIERS.map((t) => counts[t] > 0 && <Link key={t} href={`/usage/engagement/${t}${suffix}`} title={`${TIER_LABEL[t]}: ${counts[t]}`} aria-label={`${TIER_LABEL[t]} tenants`} style={{ width: `${(counts[t] / total) * 100}%`, backgroundColor: colors[t] }} className="h-full focus-visible:outline-2 focus-visible:outline-accent" />)}
    </div>
    <ul className="mt-4 grid grid-cols-2 gap-2">{TIERS.map((t) => <li key={t}><Link href={`/usage/engagement/${t}${suffix}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[t] }} aria-hidden />
      <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{TIER_LABEL[t]}</span><span className="block truncate text-[11px] text-muted">{TIER_RULE[t]}</span></span>
      <span className="text-right"><span className="block text-sm font-bold tabular-nums">{fmtCount(counts[t])}</span><span className="block text-[11px] text-muted">{fmtPct(counts[t], total)}</span></span>
    </Link></li>)}</ul>
  </div>;
}

/** One row per currency, each linking to that currency's detail page. Never summed together. */
export function CurrencySalesList({ amounts, query = "" }: { amounts: Record<string, number>; query?: string }) {
  const rows = Object.entries(amounts).sort(([, a], [, b]) => b - a);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No completed sales yet.</p>;
  return <ul className="divide-y divide-border">{rows.map(([code, amount]) => <li key={code}><Link href={`/usage/sales/${code}${query ? `?${query}` : ""}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
    <span className="flex items-center gap-2 text-sm font-semibold"><span className="rounded-md bg-surface px-2 py-0.5 text-xs">{code}</span>Completed sales</span>
    <span className="flex items-center gap-1 text-base font-bold tabular-nums">{formatMoney(amount, code, { showCode: true })}<ChevronRight size={14} className="text-muted" aria-hidden /></span>
  </Link></li>)}</ul>;
}

export interface ModuleAdoptionRow { key: string; label: string; tenants_using: number; total_records: number; adoption_pct: number }
export function ModuleAdoptionTable({ modules, totalTenants, query = "" }: { modules: ModuleAdoptionRow[]; totalTenants: number; query?: string }) {
  return <ul className="divide-y divide-border">{modules.map((m) => {
    const Icon = MODULE_ICON[m.key] ?? Boxes;
    return <li key={m.key}><Link href={`/usage/modules/${m.key}${query ? `?${query}` : ""}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-accent sm:grid-cols-[10rem_1fr_9rem_8rem]">
      <span className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={14} aria-hidden /></span>{m.label}</span>
      <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"><span className="block h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={m.adoption_pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.label} adoption`}><span className="block h-full rounded-full bg-accent" style={{ width: `${m.adoption_pct}%` }} /></span></span>
      <span className="text-right text-xs tabular-nums sm:text-left"><span className="font-semibold">{m.tenants_using}</span> <span className="text-muted">of {totalTenants} · {m.adoption_pct}%</span></span>
      <span className="hidden text-right text-xs tabular-nums text-muted sm:block">{fmtCount(m.total_records)} records</span>
    </Link></li>;
  })}</ul>;
}
