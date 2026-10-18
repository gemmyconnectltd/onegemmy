"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAiAdminUsage } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { formatCompact } from "@/lib/adminAnalytics";
import { fmtDateTime } from "@/lib/date";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** Pesaa AI requests, tokens, cost, per-business usage and recent errors. Lives in Usage; limits are configured in Settings. */
export function AiUsagePanel() {
  const [days, setDays] = useState(30);
  const usageQ = useAiAdminUsage(days);
  const u = usageQ.data;
  return (
    <section id="ai-usage" className="scroll-mt-20 space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground"><Sparkles size={14} className="text-accent" /> Pesaa AI usage</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Usage period" className="rounded-lg border border-border bg-card px-2 py-1 text-[12px] font-semibold">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {!u ? <PageLoader variant="compact" /> : (
        <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Requests" value={formatCompact(u.requests)} />
              <Stat label="Errors" value={formatCompact(u.errors)} />
              <Stat label="Blocked" value={formatCompact(u.blocked)} />
              <Stat label="Tokens" value={formatCompact(u.tokens)} />
              <Stat label="Est. cost" value={`$${u.est_cost_usd.toFixed(2)}`} />
              <Stat label="Avg latency" value={`${u.avg_latency_ms} ms`} />
            </div>
            {u.top_tenants.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <TableScroll><table className="w-full min-w-[320px] text-left text-[12.5px]">
                  <thead><tr className="border-b border-border bg-surface text-[10.5px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-semibold">Business</th><th className="px-3 py-2 text-right font-semibold">Requests</th><th className="px-3 py-2 text-right font-semibold">Est. cost</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {u.top_tenants.map((t) => (
                      <tr key={t.tenant_id ?? t.name}><td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.requests}</td><td className="px-3 py-2 text-right tabular-nums text-muted">${t.est_cost_usd.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table></TableScroll>
              </div>
            )}
            {u.recent_errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recent errors</p>
                {u.recent_errors.map((e, i) => (
                  <p key={i} className="text-[12px] text-red-600 dark:text-red-400">{fmtDateTime(e.at)} · {e.provider}: {e.error ?? "unknown error"}</p>
                ))}
              </div>
            )}
            {u.requests === 0 && <p className="text-[12px] text-muted">No AI requests in this period yet.</p>}
          </>
        )}
    </section>
  );
}
