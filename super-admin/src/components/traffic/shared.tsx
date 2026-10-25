import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import type { ErpStat, TrafficChannel, TrafficStat } from "@/lib/api/admin";
import { formatChange } from "@/lib/adminAnalytics";
import { cn } from "@/lib/utils";

export const CHANNEL_LABELS: Record<TrafficChannel, string> = {
  organic: "Organic search", direct: "Direct", social: "Social media", referral: "Referrals", paid: "Paid campaigns", other: "Other",
};
export const CHANNEL_COLORS: Record<TrafficChannel, string> = {
  organic: "#16a34a", direct: "#0284c7", social: "#8b5cf6", referral: "#d97706", paid: "#ef4444", other: "#64748b",
};

/** The card used across the Super Admin dashboards: title + subtitle on the left, an optional "View all" link on the right. */
export function Section({ title, subtitle, href, linkLabel = "View all", children, className }: {
  title: string; subtitle?: string; href?: string; linkLabel?: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
        </div>
        {href && <Link href={href} className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-accent hover:underline">{linkLabel} <ArrowRight size={11} aria-hidden /></Link>}
      </div>
      {children}
    </section>
  );
}

export function Change({ stat }: { stat: TrafficStat | ErpStat }) {
  if (stat.changePct === null) return <span>No prior data</span>;
  const up = stat.changePct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={cn("inline-flex items-center gap-1", stat.changePct === 0 ? "" : up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}><Icon size={11} aria-hidden />{formatChange(stat.changePct)} vs previous period</span>;
}

export function BackLink({ href = "/traffic", label = "Back to Website Traffic" }: { href?: string; label?: string }) {
  return <Link href={href} aria-label={label} className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface hover:text-foreground"><ArrowLeft size={15} aria-hidden /></Link>;
}

export function csvCell(v: string | number | null): string {
  const raw = String(v ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", sales: "Sales", pos: "Point of Sale", inventory: "Inventory", purchases: "Purchases", expenses: "Expenses",
  customers: "Customers", accounting: "Accounting", reports: "Reports", hr: "HR & Staff", settings: "Settings", debts: "Debts",
  services: "Services", manufacturing: "Manufacturing", branches: "Branches", support: "Support", profile: "Profile", other: "Other",
};
const PALETTE = ["#16a34a", "#0284c7", "#8b5cf6", "#d97706", "#ef4444", "#0e7490", "#db2777", "#64748b"];
export const moduleColor = (i: number) => PALETTE[i % PALETTE.length];
export const moduleLabel = (m: string) => MODULE_LABELS[m] ?? m;

/** Overview-style stat card. With `id` + `order` it is a tab (arrow keys move between tabs); with `href` it is a link. */
export function StatCard({ id, order, label, value, sub, icon: Icon, color, selected, onSelect, href, controls }: {
  id?: string; order?: string[]; label: string; value: ReactNode; sub: ReactNode; icon: React.ElementType; color: string;
  selected?: boolean; onSelect?: (id: string) => void; href?: string; controls?: string;
}) {
  const body = (
    <>
      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18` }}><Icon size={16} style={{ color }} aria-hidden /></div>
      <p className="truncate text-[18px] font-bold leading-tight tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[12px] font-medium text-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>
      {href && <ArrowUpRight size={13} aria-hidden className="absolute right-3 top-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
  const base = "group relative block rounded-xl border bg-card p-3.5 text-left transition-colors";
  if (id && onSelect && order) {
    return (
      <button
        type="button" role="tab" id={`tab-${id}`} aria-selected={selected} aria-controls={controls} tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(id)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          const next = order[(order.indexOf(id) + step + order.length) % order.length];
          onSelect(next);
          document.getElementById(`tab-${next}`)?.focus();
        }}
        className={cn(base, "w-full", selected ? "border-accent ring-1 ring-accent/30" : "border-border hover:border-accent/40")}
      >{body}</button>
    );
  }
  if (href) return <Link href={href} className={cn(base, "border-border hover:border-accent/40")}>{body}</Link>;
  return <div className={cn(base, "border-border")}>{body}</div>;
}

export const DEVICE_LABELS: Record<string, string> = { desktop: "Desktop", mobile: "Mobile phone", tablet: "Tablet", unknown: "Unknown" };
export const DEVICE_COLORS: Record<string, string> = { desktop: "#0284c7", mobile: "#16a34a", tablet: "#8b5cf6", unknown: "#64748b" };
export const deviceLabel = (d: string) => DEVICE_LABELS[d] ?? d;
export const deviceColor = (d: string) => DEVICE_COLORS[d] ?? "#64748b";
