"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Activity, Building2, CheckCircle2, Layers, Loader2, OctagonX, Save, ToggleRight } from "lucide-react";
import { useFeatureControl, useFeatureDetail, useUpdateFeature } from "@/lib/api/hooks";
import type { FeatureControl, FeatureDetail } from "@/lib/api/admin";
import { fmtDateTime } from "@/lib/date";
import { Breadcrumbs, UsageCard } from "@/components/usage/UsageShared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Metric } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { TabStrip } from "@/components/ui/TabStrip";
import { ActionsPanel } from "@/components/product-control/ActionsPanel";
import { RolloutPanel } from "@/components/product-control/RolloutPanel";
import { StatusPanel } from "@/components/product-control/StatusPanel";
import { SettingsPanel } from "@/components/product-control/SettingsPanel";
import { ExceptionsPanel } from "@/components/product-control/ExceptionsPanel";
import { UsagePanel } from "@/components/product-control/UsagePanel";
import { STATUS_META } from "@/components/product-control/status";

type Tab = "status" | "rollout" | "actions" | "settings" | "exceptions" | "usage" | "overview" | "configuration" | "plans" | "dependencies" | "history";
const CONTROL_TABS: { key: Tab; label: string }[] = [
  { key: "status", label: "Status & messages" }, { key: "rollout", label: "Rollout & beta" }, { key: "actions", label: "Actions & permissions" },
  { key: "settings", label: "Settings & limits" }, { key: "exceptions", label: "Exceptions" }, { key: "usage", label: "Usage & impact" },
];
const MODULE_TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Usage" }, { key: "configuration", label: "Details" }, { key: "plans", label: "Plans & businesses" }, { key: "dependencies", label: "Dependencies" },
];
const LEVEL = { module: "Module", submodule: "Submodule", feature: "Feature" } as const;

/** Full control over one module, submodule or feature. Parts have the control tabs; modules also keep usage, plans and dependencies. */
export default function FeatureControlPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = use(params);
  const key = decodeURIComponent(raw);
  const control = useFeatureControl(key);
  const c = control.data;
  const isModule = c?.level === "module";
  const detail = useFeatureDetail(key, { enabled: isModule });
  const [tab, setTab] = useState<Tab>("status");
  const tabs = [...CONTROL_TABS, ...(isModule ? MODULE_TABS : []), { key: "history" as Tab, label: "History" }];
  const crumbs = [{ label: "Modules", href: "/features" }, ...(c && !isModule ? [{ label: c.module.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), href: `/features/${c.module}` }] : []), { label: c?.name ?? key }];

  return <div className="space-y-5">
    <div><Breadcrumbs items={crumbs} />
      <PageHeader title={c?.name ?? "Feature"} subtitle={c?.description ?? undefined}
        actions={c && <div className="flex flex-wrap items-center gap-2"><Badge tone="slate">{LEVEL[c.level]}</Badge><Badge tone={STATUS_META[c.status].tone} dot>{STATUS_META[c.status].label}</Badge>{c.kill_switch && <Badge tone="red"><OctagonX size={11} /> Stopped</Badge>}</div>} /></div>
    {control.isLoading ? <PageLoader variant="page" /> : control.isError || !c ? <ErrorState message="Could not load this feature." onRetry={() => void control.refetch()} /> : <>
      <Summary c={c} />
      <TabStrip label="Feature sections" items={tabs.map((t) => ({ key: t.key, label: t.label, active: tab === t.key, onSelect: () => setTab(t.key) }))} />
      {tab === "status" && <StatusPanel key={`${c.status}|${c.message}|${c.scheduled_at}`} c={c} />}
      {tab === "rollout" && <RolloutPanel key={`${c.rollout_percent}`} c={c} />}
      {tab === "actions" && <ActionsPanel key={JSON.stringify(c.actions)} c={c} />}
      {tab === "settings" && <SettingsPanel key={JSON.stringify([c.settings, c.included_plans, c.plan_daily_limits])} c={c} />}
      {tab === "exceptions" && <ExceptionsPanel c={c} />}
      {tab === "usage" && <UsagePanel c={c} />}
      {tab === "history" && <History c={c} />}
      {isModule && MODULE_TABS.some((t) => t.key === tab) && (detail.isLoading ? <PageLoader variant="compact" /> : !detail.data ? <ErrorState message="Could not load this module's details." onRetry={() => void detail.refetch()} /> : <>
        {tab === "overview" && <Overview f={detail.data} />}
        {tab === "configuration" && <Configuration key={detail.data.key} f={detail.data} />}
        {tab === "plans" && <Plans f={detail.data} />}
        {tab === "dependencies" && <Dependencies f={detail.data} />}
      </>)}
    </>}
  </div>;
}

function Summary({ c }: { c: FeatureControl }) {
  const off = Object.values(c.actions).filter((r) => r !== "everyone").length;
  const items = [
    { label: "Status", value: STATUS_META[c.status].label },
    { label: "Scheduled", value: c.scheduled_status ? `${STATUS_META[c.scheduled_status].label} · ${c.scheduled_at ? fmtDateTime(c.scheduled_at) : ""}` : "Nothing" },
    { label: "Rollout", value: c.status === "beta" ? "Cohort only" : `${c.rollout_percent}%` },
    { label: "Cohort", value: String(c.cohort.length) },
    { label: "Actions limited", value: String(off) },
    { label: "Exceptions", value: String(c.overrides.length) },
  ];
  return <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{items.map((i) => <div key={i.label} className="rounded-xl border border-border bg-card px-4 py-3">
    <dt className="text-[12px] text-muted">{i.label}</dt><dd className="mt-0.5 truncate text-sm font-semibold">{i.value}</dd>
  </div>)}{c.children.length > 0 && <div className="col-span-full flex flex-wrap items-center gap-2 text-[12px] text-muted">Inside: {c.children.map((ch) => <Link key={ch.key} href={`/features/${ch.key}`} className="rounded-md bg-surface px-2 py-1 font-medium text-foreground hover:text-accent">{ch.name}</Link>)}</div>}</dl>;
}

function Overview({ f }: { f: FeatureDetail }) {
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Included" value={f.entitled_tenants} sub="Plan includes it" icon={Layers} />
      <Metric label="Switched on" value={f.active_tenants} sub="Not switched off" icon={ToggleRight} />
      <Metric label="Using" value={f.using_tenants ?? "—"} sub="Have records in it" icon={Building2} />
      <Metric label="In plans" value={f.plans.length} sub="Active and draft plans" icon={Activity} />
    </div>
    <UsageCard title="What these numbers mean" subtitle="They are three different things">
      <ul className="space-y-1.5 py-2 text-[13px] text-muted">
        <li><strong className="text-foreground">Included</strong> — the business’s plan has this feature.</li>
        <li><strong className="text-foreground">Switched on</strong> — included, and neither PESAA nor the business has switched it off.</li>
        <li><strong className="text-foreground">Using</strong> — the business has recorded data in it.</li>
      </ul>
      {f.using_tenants !== null && <Link href={`/usage/modules/${f.key}`} className="text-[13px] font-semibold text-accent hover:underline">See who uses it</Link>}
    </UsageCard>
  </div>;
}

function Configuration({ f }: { f: FeatureDetail }) {
  const update = useUpdateFeature();
  const [form, setForm] = useState({ name: f.name, description: f.description ?? "", default_enabled: f.default_enabled });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = form.name.trim() !== f.name || form.description.trim() !== (f.description ?? "") || form.default_enabled !== f.default_enabled;
  const run = async (data: Parameters<typeof update.mutateAsync>[0]["data"]) => {
    setError(null); setSaved(false);
    try { await update.mutateAsync({ key: f.key, data }); setSaved(true); }
    catch (e: unknown) { setError((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Could not save."); }
  };
  const save = () => run({ name: form.name.trim(), description: form.description.trim() || null, default_enabled: form.default_enabled });
  return <div className="space-y-4">
    <UsageCard title="Details" subtitle="The key never changes. Businesses see the name and description.">
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <Field label="Key" hint="Stable identifier used by plans and the product. Cannot be changed."><Input value={f.key} readOnly /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={2} maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={form.default_enabled} onChange={(e) => setForm({ ...form, default_enabled: e.target.checked })} /><span><span className="font-medium">On by default for businesses without a plan</span><span className="block text-[12px] text-muted">Businesses on a plan get exactly what the plan includes; this only applies to older businesses not yet on one.</span></span></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button onClick={() => void save()} disabled={!dirty || !form.name.trim() || update.isPending}>{update.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />} Save changes</Button>
        {saved && !dirty && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600"><CheckCircle2 size={13} /> Saved</span>}
        {error && <span role="alert" className="text-[12px] font-medium text-red-600">{error}</span>}
      </div>
    </UsageCard>
  </div>;
}

function Plans({ f }: { f: FeatureDetail }) {
  return <div className="grid gap-4 lg:grid-cols-2">
    <UsageCard title="Plans that include it" subtitle="Change a plan’s modules in Plans & Billing" action={<Link href="/plans" className="text-[12px] font-semibold text-accent hover:underline">Open plans</Link>}>
      {f.plans.length === 0 ? <p className="py-6 text-center text-sm text-muted">No plan includes this feature yet.</p> : <ul className="divide-y divide-border">{f.plans.map((p) => <li key={p.id} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium">{p.name}</span><Badge tone={p.status === "active" ? "green" : "slate"}>{p.status}</Badge></li>)}</ul>}
    </UsageCard>
    <UsageCard title="Businesses" subtitle="Where the feature has been switched off">
      <ul className="divide-y divide-border text-sm">
        <li className="flex justify-between py-2.5"><span>Switched off by PESAA for a business</span><span className="font-semibold tabular-nums">{f.overridden_off_tenants}</span></li>
        <li className="flex justify-between py-2.5"><span>Turned off by the business itself</span><span className="font-semibold tabular-nums">{f.deactivated_by_tenant}</span></li>
      </ul>
      <p className="pt-2 text-[12px] text-muted">To restrict or restore it for one business, open the business and use its Features tab.</p>
    </UsageCard>
  </div>;
}

function Dependencies({ f }: { f: FeatureDetail }) {
  const list = (items: { key: string; name: string }[], empty: string) => items.length === 0 ? <p className="py-6 text-center text-sm text-muted">{empty}</p> : <ul className="divide-y divide-border">{items.map((d) => <li key={d.key}><Link href={`/features/${d.key}`} className="block py-2.5 text-sm font-medium hover:text-accent">{d.name}</Link></li>)}</ul>;
  return <div className="grid gap-4 lg:grid-cols-2">
    <UsageCard title="Needs" subtitle="Must be switched on for this feature to work">{list(f.needs, "Works on its own.")}</UsageCard>
    <UsageCard title="Needed by" subtitle="Features that rely on this one">{list(f.needed_by, "No other feature relies on it.")}</UsageCard>
  </div>;
}

function History({ c }: { c: FeatureControl }) {
  if (c.history.length === 0) return <EmptyState title="No changes recorded" description="Status, rollout, cohort and action changes will appear here with who made them and why." />;
  return <UsageCard title="Changes" subtitle="Most recent first"><ul className="divide-y divide-border">{c.history.map((h) => <li key={h.id} className="py-2.5 text-sm"><p className="font-medium">{h.summary}</p><p className="text-[12px] text-muted">{h.actor ?? "Unknown"} · {h.at ? fmtDateTime(h.at) : ""}</p></li>)}</ul></UsageCard>;
}
