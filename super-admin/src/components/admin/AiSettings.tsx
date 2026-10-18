"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { useAiAdminSettings, useUpdateAiSettings } from "@/lib/api/hooks";
import type { AiAdminSettings } from "@/lib/api";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { SettingRow, SaveBar } from "./settingsParts";

function Config({ settings, onDirtyChange }: { settings: AiAdminSettings; onDirtyChange: (d: boolean) => void }) {
  const update = useUpdateAiSettings();
  const initialPlans = Object.entries(settings.plan_limits).map(([k, v]) => [k, String(v)] as [string, string]);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [defLimit, setDefLimit] = useState(String(settings.default_monthly_limit));
  const [plans, setPlans] = useState<[string, string][]>(initialPlans);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = enabled !== settings.enabled || defLimit !== String(settings.default_monthly_limit) || JSON.stringify(plans) !== JSON.stringify(initialPlans);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const limitInvalid = defLimit !== "" && (!/^\d+$/.test(defLimit));
  const planInvalid = plans.some(([n, v]) => (n.trim() === "") !== (v === "") || (v !== "" && !/^\d+$/.test(v)));

  const save = async () => {
    setError(null); setSaved(false);
    const limits: Record<string, number> = {};
    for (const [name, v] of plans) if (name.trim() && v !== "") limits[name.trim()] = Math.max(0, Math.floor(Number(v)));
    try {
      await update.mutateAsync({ enabled, default_monthly_limit: Math.max(0, Math.floor(Number(defLimit) || 0)), plan_limits: limits });
      setSaved(true);
    } catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't save AI settings."); }
  };

  return (
    <>
      <SettingRow label="Enable Pesaa AI" hint="When off, the assistant is unavailable to every business.">
        <Toggle checked={enabled} onChange={(v) => { setEnabled(v); setSaved(false); }} label="Enable Pesaa AI" size="sm" />
      </SettingRow>
      <SettingRow label="Default monthly requests per business" hint="Applies to every plan without its own limit.">
        <Input type="number" min="0" value={defLimit} onChange={(e) => { setDefLimit(e.target.value); setSaved(false); }} className="w-28 text-right" aria-label="Default monthly limit" aria-invalid={limitInvalid} />
      </SettingRow>
      <SettingRow label="Plan-specific limits" hint="Overrides the default for businesses on that plan." stack>
        <div className="space-y-2">
          {plans.map(([name, v], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={name} placeholder="plan, e.g. free" onChange={(e) => { setPlans((p) => p.map((r, j) => (j === i ? [e.target.value, r[1]] : r))); setSaved(false); }} className="max-w-[10rem]" aria-label="Plan name" />
              <Input type="number" min="0" value={v} onChange={(e) => { setPlans((p) => p.map((r, j) => (j === i ? [r[0], e.target.value] : r))); setSaved(false); }} className="w-28 text-right" aria-label="Plan limit" />
              <button type="button" aria-label="Remove plan limit" onClick={() => { setPlans((p) => p.filter((_, j) => j !== i)); setSaved(false); }} className="rounded p-1.5 text-muted hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setPlans((p) => [...p, ["", ""]])} className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"><Plus size={12} /> Add plan limit</button>
        </div>
      </SettingRow>
      <SaveBar dirty={dirty} invalid={limitInvalid || planInvalid} saving={update.isPending} saved={saved} error={error} onSave={save} />
    </>
  );
}

/** Pesaa AI configuration only. Requests, cost and errors are analytics and live in the Usage module. */
export function AiSettings({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) {
  const settingsQ = useAiAdminSettings();
  const s = settingsQ.data;
  if (settingsQ.isError) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load AI settings. <button onClick={() => void settingsQ.refetch()} className="font-semibold underline">Retry</button></p>;
  if (!s) return <PageLoader variant="compact" />;
  const live = s.provider.active !== "mock";
  return (
    <>
      <SettingRow label="Provider" hint="Set on the server; not editable here.">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className={`h-2 w-2 rounded-full ${live && s.provider.key_present ? "bg-emerald-500" : "bg-amber-500"}`} />
          {s.provider.active}{live ? ` · ${s.provider.model}` : " (offline, no paid requests)"}
          <span className="font-normal text-muted">· {live ? (s.provider.key_present ? "key configured" : "key missing") : "no key needed"}</span>
        </span>
      </SettingRow>
      <Config settings={s} onDirtyChange={onDirtyChange} />
      <p className="pt-3 text-[12px] text-muted">Requests, tokens, cost and errors: <Link href="/usage#ai-usage" className="font-semibold text-accent hover:underline">View AI Usage →</Link></p>
    </>
  );
}
