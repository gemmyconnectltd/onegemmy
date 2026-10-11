"use client";

import Link from "next/link";
import { AlertTriangle, Check, XCircle } from "lucide-react";
import { DonutChart } from "@/components/charts/lazy";
import type { PlatformStatus as PlatformStatusData } from "@/lib/api/admin";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { formatCompact, formatFull } from "@/lib/adminAnalytics";
import { QueryBody, SectionCard, type SectionQuery } from "./shared";
import { cn } from "@/lib/utils";

const ROWS = [
  { key: "active", label: "Active Tenants", color: "#059669", status: "active" },
  { key: "suspended", label: "Suspended Tenants", color: "#ef4444", status: "suspended" },
  { key: "pending", label: "Pending Approval", color: "#d97706", status: "pending" },
] as const;

// Only reported when the backend actually measured it (a live DB round-trip),
// so the copy states what was measured rather than a blanket "all good".
const SYSTEM = {
  operational: { title: "All Systems Operational", note: "Database responding normally", icon: Check,
    strip: "border-emerald-500/20 bg-emerald-500/10", badge: "bg-emerald-500 text-white", text: "text-emerald-700 dark:text-emerald-400" },
  degraded: { title: "Degraded performance", note: "Database is responding slowly", icon: AlertTriangle,
    strip: "border-amber-500/25 bg-amber-500/10", badge: "bg-amber-500 text-white", text: "text-amber-700 dark:text-amber-400" },
  down: { title: "Database unreachable", note: "The platform can't reach its database", icon: XCircle,
    strip: "border-red-500/25 bg-red-500/10", badge: "bg-red-500 text-white", text: "text-red-700 dark:text-red-400" },
} as const;

export function PlatformStatus({ query, data }: { query: SectionQuery; data: PlatformStatusData | undefined }) {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const t = data?.tenants;
  const live = ROWS.filter((r) => (t?.[r.key] ?? 0) > 0);
  const donut = live.map((r) => ({ name: r.label, value: t![r.key] }));
  const sys = data ? SYSTEM[data.system.status] : null;

  return (
    <SectionCard title="Platform Status" subtitle="Tenants by status, right now">
      <QueryBody query={query} errorMessage="Failed to load platform status." empty={!t || t.total === 0} emptyMessage="No tenants match these filters">
        {t && (
          <>
            {/* Donut + rows share the middle, vertically centred in the free space */}
            <div className="my-auto flex items-center gap-5 py-2">
              <div className="relative h-[132px] w-[132px] flex-shrink-0">
                <DonutChart data={donut} colors={live.map((r) => r.color)} innerRadius={46} outerRadius={64} tooltipStyle={c.tooltip} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[28px] font-bold leading-none text-foreground">{formatCompact(t.total)}</span>
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Total Tenants</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 divide-y divide-border">
                {ROWS.map((r) => (
                  <Link key={r.key} href={`/admin/tenants?status=${r.status}`} title={`View ${r.status} tenants`}
                    className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-[13px] transition-colors hover:bg-surface">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{r.label}</span>
                    <span className="text-[15px] font-bold tabular-nums text-foreground">{formatFull(t[r.key])}</span>
                  </Link>
                ))}
              </div>
            </div>
            {sys && (
              <div
                className={cn("mt-4 flex items-center gap-3 rounded-xl border px-3.5 py-3", sys.strip)}
                title={data?.system.dbLatencyMs != null ? `Database round-trip ${Math.round(data.system.dbLatencyMs)} ms` : undefined}
              >
                <span className={cn("flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full", sys.badge)}>
                  <sys.icon size={14} strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className={cn("text-[13px] font-semibold leading-tight", sys.text)}>{sys.title}</p>
                  <p className="text-[12px] text-muted">{sys.note}</p>
                </div>
              </div>
            )}
          </>
        )}
      </QueryBody>
    </SectionCard>
  );
}
