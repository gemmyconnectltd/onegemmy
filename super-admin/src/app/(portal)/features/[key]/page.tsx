"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Activity, Building2, CheckCircle2, Layers, Loader2, Save, ToggleRight } from "lucide-react";
import { useFeatureDetail, useUpdateFeature } from "@/lib/api/hooks";
import type { FeatureDetail } from "@/lib/api/admin";
import { fmtDateTime } from "@/lib/date";
import { Breadcrumbs, UsageCard } from "@/components/usage/UsageShared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Metric } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { TabStrip } from "@/components/ui/TabStrip";

type Tab = "overview" | "configuration" | "plans" | "dependencies" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" }, { key: "configuration", label: "Configuration" }, { key: "plans", label: "Plans & businesses" },
  { key: "dependencies", label: "Dependencies" }, { key: "history", label: "History" },
];

export default function FeatureDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const query = useFeatureDetail(key);
  const [tab, setTab] = useState<Tab>("overview");
  const f = query.data;
  return <div className="space-y-5">
    <div><Breadcrumbs items={[{ label: "Features", href: "/features" }, { label: f?.name ?? key }]} />
      <PageHeader title={f?.name ?? "Feature"} subtitle={f?.description ?? undefined} actions={f && <Badge tone={f.is_active ? "green" : "slate"} dot>{f.is_active ? "Active" : "Switched off"}</Badge>} /></div>
    {query.isLoading ? <PageLoader variant="page" /> : query.isError || !f ? <ErrorState message="Could not load this feature." onRetry={() => void query.refetch()} /> : <>
      <TabStrip label="Feature sections" items={TABS.map((t) => ({ key: t.key, label: t.label, active: tab === t.key, onSelect: () => setTab(t.key) }))} />
      {tab === "overview" && <Overview f={f} />}
      {tab === "configuration" && <Configuration key={f.key} f={f} />}
      {tab === "plans" && <Plans f={f} />}
      {tab === "dependencies" && <Dependencies f={f} />}
      {tab === "history" && <History f={f} />}
    </>}
  </div>;
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
  const { confirm, dialog } = useConfirmDialog();
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
    <UsageCard title={f.is_active ? "Switch off for the whole platform" : "Switch on for the whole platform"} subtitle="Affects every business. Nothing they have recorded is deleted.">
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <p className="max-w-xl text-[13px] text-muted">{f.is_active ? "Businesses lose access to this feature straight away, even if their plan includes it. Switch it back on and everything is as they left it." : "Businesses whose plan includes it regain access."}</p>
        <Button variant={f.is_active ? "destructive" : "secondary"} onClick={() => f.is_active
          ? confirm({ title: `Switch off ${f.name}?`, message: `${f.entitled_tenants} business${f.entitled_tenants === 1 ? "" : "es"} include this feature and will lose access immediately. Their data is kept.`, confirmLabel: "Switch off", danger: true, confirmText: f.key, onConfirm: () => void run({ is_active: false, confirm_key: f.key }) })
          : void run({ is_active: true })}>{f.is_active ? "Switch off…" : "Switch on"}</Button>
      </div>
    </UsageCard>
    {dialog}
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

function History({ f }: { f: FeatureDetail }) {
  if (f.history.length === 0) return <EmptyState title="No changes recorded" description="Edits to this feature will appear here with who made them." />;
  return <UsageCard title="Changes" subtitle="Most recent first"><ul className="divide-y divide-border">{f.history.map((h) => <li key={h.id} className="py-2.5 text-sm"><p className="font-medium">{h.summary}</p><p className="text-[12px] text-muted">{h.actor ?? "Unknown"} · {h.at ? fmtDateTime(h.at) : ""}</p></li>)}</ul></UsageCard>;
}
