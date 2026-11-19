"use client";

import { useState } from "react";
import type { FeatureControl, SettingDef } from "@/lib/api/admin";
import { useSetFeatureSettings } from "@/lib/api/hooks";
import { ReasonDialog } from "@/components/features/ReasonDialog";
import { UsageCard } from "@/components/usage/UsageShared";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { errorText } from "./status";

type Values = Record<string, string>;

const toText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function parseSetting(d: SettingDef, raw: string): string | number | null {
  const v = raw.trim();
  if (!v) return null;
  return d.kind === "int" || d.kind === "number" ? Number(v) : v;
}

/** One input per setting, typed by its kind. Shared by the platform settings and a business's exception. */
export function SettingFields({ defs, values, onChange, inheritFrom }: { defs: SettingDef[]; values: Values; onChange: (v: Values) => void; inheritFrom?: Values }) {
  return <div className="grid gap-4 sm:grid-cols-2">{defs.map((d) => <Field key={d.name} label={d.label} hint={d.help}>
    <Input value={values[d.name] ?? ""} onChange={(e) => onChange({ ...values, [d.name]: e.target.value })}
      inputMode={d.kind === "int" || d.kind === "number" ? "decimal" : undefined}
      placeholder={inheritFrom ? (inheritFrom[d.name] ? `Same as every business: ${inheritFrom[d.name]}` : "Same as every business") : d.default !== null ? `Default: ${d.default}` : d.kind === "hours" ? "07:00-20:00" : "Not set"} />
  </Field>)}</div>;
}

/** Settings and limits for one module or part, which plans include a part, and daily limits per plan. */
export function SettingsPanel({ c }: { c: FeatureControl }) {
  const save = useSetFeatureSettings();
  const initial: Values = Object.fromEntries(c.setting_defs.map((d) => [d.name, toText(c.settings[d.name])]));
  const [values, setValues] = useState<Values>(initial);
  const [plans, setPlans] = useState<string[]>(c.included_plans);
  const [limits, setLimits] = useState<Values>(Object.fromEntries(c.plans.map((p) => [p.id, toText(c.plan_daily_limits[p.id])])));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPart = c.level !== "module";
  const eligible = c.plans.filter((p) => p.has_module);
  const changed = JSON.stringify(values) !== JSON.stringify(initial) || JSON.stringify([...plans].sort()) !== JSON.stringify([...c.included_plans].sort())
    || c.plans.some((p) => (limits[p.id] ?? "") !== toText(c.plan_daily_limits[p.id]));
  const generic = c.setting_defs.filter((d) => ["daily_create_limit", "write_hours", "timezone", "notice_hours"].includes(d.name));
  const specific = c.setting_defs.filter((d) => !generic.includes(d));

  const submit = async (reason: string) => {
    setError(null);
    try {
      await save.mutateAsync({ key: c.key, data: {
        settings: Object.fromEntries(c.setting_defs.map((d) => [d.name, parseSetting(d, values[d.name] ?? "")])),
        ...(isPart ? { plans } : {}),
        plan_daily_limits: Object.fromEntries(c.plans.map((p) => [p.id, limits[p.id]?.trim() ? Number(limits[p.id]) : null])),
        reason,
      } });
      setOpen(false);
    } catch (e: unknown) { setError(errorText(e)); }
  };

  return <div className="space-y-4">
    <UsageCard title="Limits & hours" subtitle="Enforced by Pesaa for every business. A business can get its own values under Exceptions.">
      <div className="py-1"><SettingFields defs={generic} values={values} onChange={setValues} /></div>
    </UsageCard>
    {specific.length > 0 && <UsageCard title={`${c.name} rules`} subtitle="Read by this feature's own code when a record is saved.">
      <div className="py-1"><SettingFields defs={specific} values={values} onChange={setValues} /></div>
    </UsageCard>}
    <UsageCard title="Plans" subtitle={isPart ? "Which plans include this part. None ticked: every plan that has the module." : "Which plans include a module is set in Plans & Billing. Daily limits per plan are set here."}>
      {c.plans.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">No plans yet.</p> : <ul className="divide-y divide-border">{c.plans.map((p) => {
        const usable = !isPart || p.has_module;
        return <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <label className="flex items-center gap-2.5 text-sm">
            {isPart && <input type="checkbox" disabled={!p.has_module} checked={plans.includes(p.id)} onChange={(e) => setPlans(e.target.checked ? [...plans, p.id] : plans.filter((x) => x !== p.id))} />}
            <span className="font-medium">{p.name}</span>
            {!p.has_module && <span className="text-[12px] text-muted">module not in this plan</span>}
            {isPart && p.has_module && plans.length > 0 && !plans.includes(p.id) && <span className="text-[12px] text-[var(--warning)]">part not included</span>}
          </label>
          {usable && <Input aria-label={`Daily limit on new records for ${p.name}`} value={limits[p.id] ?? ""} onChange={(e) => setLimits({ ...limits, [p.id]: e.target.value })} inputMode="numeric" placeholder="Daily limit: same as above" className="w-48" />}
        </li>;
      })}</ul>}
      {isPart && eligible.length > 0 && plans.length === 0 && <p className="pt-2 text-[12px] text-muted">Included in all {eligible.length} plan{eligible.length === 1 ? "" : "s"} that have the module.</p>}
    </UsageCard>
    <div className="flex gap-2">
      <Button disabled={!changed} onClick={() => { setError(null); setOpen(true); }}>Save settings…</Button>
      {changed && <Button variant="ghost" onClick={() => { setValues(initial); setPlans(c.included_plans); setLimits(Object.fromEntries(c.plans.map((p) => [p.id, toText(c.plan_daily_limits[p.id])]))); }}>Reset</Button>}
    </div>
    {open && <ReasonDialog title={`Save settings for ${c.name}?`} message="New values apply to the next change a business makes. Nothing already recorded is touched."
      confirmLabel="Save" pending={save.isPending} error={error} onSubmit={(r) => void submit(r)} onClose={() => setOpen(false)} />}
  </div>;
}
