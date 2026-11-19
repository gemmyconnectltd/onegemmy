"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import type { ActionRule, FeatureAction, FeatureControl, FeatureOverride, FeatureStatus } from "@/lib/api/admin";
import { useRemoveFeatureOverride, useSetFeatureOverride, useTenants } from "@/lib/api/hooks";
import { ReasonDialog } from "@/components/features/ReasonDialog";
import { UsageCard } from "@/components/usage/UsageShared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchBox } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select, Textarea } from "@/components/ui/Form";
import { ACTION_META, STATUS_META, errorText } from "./status";
import { RuleEditor, ruleLabel } from "./RuleEditor";
import { SettingFields, parseSetting } from "./SettingsPanel";

const EXCEPTION_SETTINGS = ["daily_create_limit", "write_hours", "timezone", "return_window_days", "approval_above"];

/** Exceptions: one business gets its own status, message, action rules or limits. Everything left empty follows the platform. */
export function ExceptionsPanel({ c }: { c: FeatureControl }) {
  const remove = useRemoveFeatureOverride();
  const [editing, setEditing] = useState<{ tenantId: string; tenantName: string; current?: FeatureOverride } | null>(null);
  const [removing, setRemoving] = useState<FeatureOverride | null>(null);
  const [error, setError] = useState<string | null>(null);

  return <div className="space-y-4">
    <UsageCard title="Business exceptions" subtitle={`Businesses that get ${c.name} differently from everyone else.`}
      action={<Button size="sm" onClick={() => setEditing({ tenantId: "", tenantName: "" })}><Plus size={13} /> Add exception</Button>}>
      {c.overrides.length === 0 ? <p className="rounded-lg bg-surface px-3 py-6 text-center text-[13px] text-muted">No exceptions. Every business follows the platform settings.</p>
        : <ul className="divide-y divide-border">{c.overrides.map((o) => <li key={o.tenant_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold"><Building2 size={14} aria-hidden className="text-muted" />{o.tenant_name}</p>
            <div className="flex flex-wrap gap-1.5">
              {o.status && <Badge tone={STATUS_META[o.status].tone} dot>{STATUS_META[o.status].label}</Badge>}
              {(Object.entries(o.actions) as [FeatureAction, ActionRule][]).map(([a, r]) => <Badge key={a} tone="slate">{ACTION_META[a].label}: {ruleLabel(r)}</Badge>)}
              {Object.entries(o.settings).map(([k, v]) => <Badge key={k} tone="blue">{c.setting_defs.find((d) => d.name === k)?.label ?? k}: {String(v)}</Badge>)}
            </div>
            {o.message && <p className="text-[12px] text-muted">Message: {o.message}</p>}
            {o.reason && <p className="text-[12px] text-muted">Why: {o.reason}</p>}
          </div>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setEditing({ tenantId: o.tenant_id, tenantName: o.tenant_name, current: o })}><Pencil size={13} /> Edit</Button>
            <Button variant="ghost" size="sm" aria-label={`Remove the exception for ${o.tenant_name}`} onClick={() => { setError(null); setRemoving(o); }}><Trash2 size={13} /></Button>
          </div>
        </li>)}</ul>}
    </UsageCard>
    {editing && <ExceptionEditor c={c} start={editing} onClose={() => setEditing(null)} />}
    {removing && <ReasonDialog title={`Remove the exception for ${removing.tenant_name}?`} message={`${removing.tenant_name} goes back to the platform settings straight away.`}
      confirmLabel="Remove" pending={remove.isPending} error={error}
      onSubmit={(reason) => void remove.mutateAsync({ key: c.key, tenantId: removing.tenant_id, reason }).then(() => setRemoving(null)).catch((e: unknown) => setError(errorText(e)))}
      onClose={() => setRemoving(null)} />}
  </div>;
}

function ExceptionEditor({ c, start, onClose }: { c: FeatureControl; start: { tenantId: string; tenantName: string; current?: FeatureOverride }; onClose: () => void }) {
  const save = useSetFeatureOverride();
  const [tenant, setTenant] = useState(start.tenantId ? { id: start.tenantId, name: start.tenantName } : null);
  const [q, setQ] = useState("");
  const search = useTenants(1, 6, { enabled: !tenant && q.trim().length >= 2 }, { q: q.trim() });
  const [status, setStatus] = useState<FeatureStatus | "">(start.current?.status ?? "");
  const [message, setMessage] = useState(start.current?.message ?? "");
  const [actions, setActions] = useState<Partial<Record<FeatureAction, ActionRule>>>(start.current?.actions ?? {});
  const defs = c.setting_defs.filter((d) => EXCEPTION_SETTINGS.includes(d.name));
  const [settings, setSettings] = useState<Record<string, string>>(Object.fromEntries(defs.map((d) => [d.name, start.current?.settings[d.name] != null ? String(start.current.settings[d.name]) : ""])));
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = Object.fromEntries(defs.map((d) => [d.name, c.settings[d.name] != null ? String(c.settings[d.name]) : ""]));

  const submit = async (reason: string) => {
    if (!tenant) return;
    setError(null);
    try {
      await save.mutateAsync({ key: c.key, tenantId: tenant.id, data: {
        status: status || null, message: message.trim() || null, actions,
        settings: Object.fromEntries(defs.map((d) => [d.name, parseSetting(d, settings[d.name] ?? "")])), reason,
      } });
      onClose();
    } catch (e: unknown) { setError(errorText(e)); setAsking(false); }
  };

  return <Drawer open onClose={onClose} side="right" size="xl" title={start.current ? `Exception for ${start.tenantName}` : "New business exception"} description={c.name}
    footer={<div className="flex items-center justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!tenant} onClick={() => setAsking(true)}>Save exception…</Button></div>}>
    <div className="space-y-5 px-5 py-4">
      <Field label="Business" required>{tenant
        ? <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span className="truncate font-medium">{tenant.name}</span>{!start.current && <Button variant="ghost" size="sm" onClick={() => setTenant(null)}>Change</Button>}</div>
        : <div className="space-y-2"><SearchBox value={q} onChange={setQ} placeholder="Search a business" />
          {(search.data?.items ?? []).length > 0 && <ul className="divide-y divide-border rounded-lg border border-border">{(search.data?.items ?? []).map((t) =>
            <li key={t.id}><button type="button" onClick={() => setTenant({ id: t.id, name: t.name })} className="w-full px-3 py-2 text-left text-sm hover:bg-surface/50">{t.name}</button></li>)}</ul>}
        </div>}
      </Field>
      <Field label="Status for this business" hint={`Every business: ${STATUS_META[c.status].label}.`}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as FeatureStatus | "")}>
          <option value="">Same as every business</option>{c.statuses.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </Select>
      </Field>
      <Field label="Message for this business" hint="Empty: the platform message.">
        <Textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <section aria-label="Actions" className="space-y-3">
        <p className="text-[13px] font-semibold">Actions</p>
        {(Object.keys(ACTION_META) as FeatureAction[]).map((a) => <div key={a} className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-start">
          <div><p className="text-sm font-medium">{ACTION_META[a].label}</p><p className="text-[11px] text-muted">Every business: {ruleLabel(c.actions[a])}</p></div>
          <RuleEditor inherit label={`${ACTION_META[a].label} for this business`} value={actions[a]} onChange={(v) => {
            const next = { ...actions };
            if (v === undefined) delete next[a]; else next[a] = v;
            setActions(next);
          }} />
        </div>)}
      </section>
      <section aria-label="Limits" className="space-y-3">
        <p className="text-[13px] font-semibold">Limits &amp; rules</p>
        <SettingFields defs={defs} values={settings} onChange={setSettings} inheritFrom={platform} />
      </section>
      {error && <p role="alert" className="text-[13px] font-medium text-[var(--error)]">{error}</p>}
    </div>
    {asking && tenant && <ReasonDialog title={`Save the exception for ${tenant.name}?`} message="It applies to this business straight away. Fields left as “Same as every business” keep following the platform."
      confirmLabel="Save" pending={save.isPending} error={error} onSubmit={(r) => void submit(r)} onClose={() => setAsking(false)} />}
  </Drawer>;
}
