"use client";

import { useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { useAiAdminSettings, useAiAdminUsage, useUpdateAiSettings } from "@/lib/api/hooks";
import type { AiAdminSettings } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
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

function Limits({ settings }: { settings: AiAdminSettings }) {
  const update = useUpdateAiSettings();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [defLimit, setDefLimit] = useState(String(settings.default_monthly_limit));
  const [plans, setPlans] = useState<[string, string][]>(Object.entries(settings.plan_limits).map(([k, v]) => [k, String(v)]));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setError(null);
    setSaved(false);
    const limits: Record<string, number> = {};
    for (const [name, v] of plans) if (name.trim() && v !== "") limits[name.trim()] = Math.max(0, Math.floor(Number(v)));
    try {
      await update.mutateAsync({ enabled, default_monthly_limit: Math.max(0, Math.floor(Number(defLimit) || 0)), plan_limits: limits });
      setSaved(true);
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Couldn't save AI settings.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enable Pesaa AI</p>
          <p className="text-[11px] text-muted">When off, the assistant is unavailable to every business.</p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label="Enable Pesaa AI" size="sm" />
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Monthly requests per business</p>
        <p className="mb-2 text-[11px] text-muted">The default applies to every plan unless you set a plan-specific limit below.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="number" min="0" value={defLimit} onChange={(e) => setDefLimit(e.target.value)} className="w-28" aria-label="Default monthly limit" />
          <span className="text-[12px] text-muted">default</span>
        </div>
        <div className="mt-3 space-y-2">
          {plans.map(([name, v], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={name} placeholder="plan name, e.g. free" onChange={(e) => setPlans((p) => p.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className="max-w-[10rem]" aria-label="Plan name" />
              <Input type="number" min="0" value={v} onChange={(e) => setPlans((p) => p.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="w-28" aria-label="Plan limit" />
              <button type="button" aria-label="Remove plan limit" onClick={() => setPlans((p) => p.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setPlans((p) => [...p, ["", ""]])} className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">
            <Plus size={12} /> Add plan limit
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={save} disabled={update.isPending} className="rounded-lg text-[13px]">{update.isPending ? "Saving…" : "Save AI settings"}</Button>
        {saved && <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Saved</span>}
        {error && <span className="text-[12px] font-medium text-red-600 dark:text-red-400" role="alert">{error}</span>}
      </div>
    </div>
  );
}

/** Super-admin AI management: on/off, per-plan limits, read-only provider status, usage + errors. */
export function AiSettings() {
  const settingsQ = useAiAdminSettings();
  const [days, setDays] = useState(30);
  const usageQ = useAiAdminUsage(days);
  const s = settingsQ.data;
  const u = usageQ.data;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10"><Sparkles size={16} className="text-accent" /></div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Pesaa AI</h2>
          <p className="text-[11px] text-muted">Availability, usage limits and cost monitoring</p>
        </div>
      </div>

      {!s ? <PageLoader variant="compact" /> : (
        <>
          <div className="rounded-lg bg-surface px-3.5 py-2.5 text-[12px] text-muted">
            Provider: <b className="text-foreground">{s.provider.active}</b>
            {s.provider.active === "mock" ? " (offline, no paid requests)" : ` · ${s.provider.model}`}
            {" · "}API key {s.provider.key_present ? "configured" : "not set"}. The provider and key are server configuration (<code>AI_PROVIDER</code> = mock | openai | groq, plus <code>OPENAI_API_KEY</code> or <code>GROQ_API_KEY</code>), never editable here.
          </div>
          <Limits settings={s} />
        </>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-foreground">Usage</h3>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Usage period"
            className="rounded-lg border border-border bg-card px-2 py-1 text-[12px] font-semibold">
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
                <table className="w-full min-w-[320px] text-left text-[12.5px]">
                  <thead><tr className="border-b border-border bg-surface text-[10.5px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-semibold">Business</th><th className="px-3 py-2 text-right font-semibold">Requests</th><th className="px-3 py-2 text-right font-semibold">Est. cost</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {u.top_tenants.map((t) => (
                      <tr key={t.tenant_id ?? t.name}><td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.requests}</td><td className="px-3 py-2 text-right tabular-nums text-muted">${t.est_cost_usd.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
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
      </div>
    </div>
  );
}
