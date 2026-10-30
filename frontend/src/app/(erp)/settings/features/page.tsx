"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Loader2, Lock, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { SettingsCard } from "@/components/settings/parts";
import { useMyModules, useSetMyModule } from "@/lib/api/hooks";
import type { ModuleStatus, TenantModule } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { matchesFilter, moduleCounts, moduleHref, switchBlockers } from "@/lib/moduleAvailability";
import { cn } from "@/lib/utils";

const STATUS: Record<ModuleStatus, { label: string; tone: string }> = {
  enabled: { label: "On", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  available: { label: "Off", tone: "bg-surface text-muted border border-border" },
  not_included: { label: "Not in your plan", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  restricted: { label: "Restricted", tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
  { id: "upgrade", label: "Needs upgrade" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function ModuleRow({ module: m, canManage, busyKey, onToggle }: { module: TenantModule; canManage: boolean; busyKey: string | null; onToggle: (m: TenantModule, enabled: boolean) => void }) {
  const status = STATUS[m.status];
  const switchable = m.status === "enabled" || m.status === "available";
  const { turnOnFirst, turnOffFirst } = switchBlockers(m);
  return (
    <li className="flex flex-col gap-3 border-b border-border py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/settings/features/${m.key}`} className="text-sm font-semibold text-foreground hover:text-accent hover:underline">{m.name}</Link>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.tone)}>{status.label}</span>
        </div>
        {m.description && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{m.description}</p>}
        {m.needs.length > 0 && <p className="mt-1 text-[12px] text-muted">Works together with {m.needs.map((n) => n.name).join(", ")}.</p>}
        {turnOnFirst.length > 0 && <p className="mt-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">Turn on {turnOnFirst.join(", ")} first.</p>}
        {turnOffFirst.length > 0 && <p className="mt-1 text-[12px] text-muted">Used by {turnOffFirst.join(", ")}; turn those off to switch this one off.</p>}
        {m.status === "restricted" && <p className="mt-1 text-[12px] text-muted">Pesaa has paused this for your business. Contact support to have it restored.</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {m.status === "enabled" && moduleHref(m.key) && <Link href={moduleHref(m.key)!} className="mr-3 text-[12px] font-semibold text-accent hover:underline">Open</Link>}
        {switchable && <Toggle checked={m.status === "enabled"} label={`${m.name} ${m.status === "enabled" ? "on" : "off"}`} loading={busyKey === m.key} disabled={!canManage || busyKey !== null} onChange={(v) => onToggle(m, v)} />}
        {m.status === "not_included" && <Link href="/settings/billing"><Button variant="outline" size="sm">Upgrade plan <ArrowUpRight size={13} /></Button></Link>}
        {m.status === "restricted" && <Link href="/support"><Button variant="outline" size="sm"><Lock size={13} /> Contact support</Button></Link>}
      </div>
    </li>
  );
}

export default function FeaturesPage() {
  const { hasPermission } = useAuth();
  const { data, isLoading, error } = useMyModules();
  const setModule = useSetMyModule();
  const { confirm, dialog } = useConfirmDialog();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canManage = hasPermission("tenants:update");
  const counts = moduleCounts(data?.modules ?? []);

  const rows = useMemo(() => (data?.modules ?? []).filter((m) => matchesFilter(m, filter) && `${m.name} ${m.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), [data, q, filter]);

  const apply = async (m: TenantModule, enabled: boolean) => {
    setProblem(null);
    setBusyKey(m.key);
    try { await setModule.mutateAsync({ key: m.key, enabled }); }
    catch (err: unknown) { setProblem((err as { detail?: string })?.detail ?? (err as Error)?.message ?? "Couldn't change this module. Try again."); }
    finally { setBusyKey(null); }
  };

  const toggle = (m: TenantModule, enabled: boolean) => {
    if (enabled) { void apply(m, true); return; }
    const { turnOffFirst } = switchBlockers(m);
    if (turnOffFirst.length > 0) { setProblem(`Turn off ${turnOffFirst.join(", ")} first: it relies on ${m.name}.`); return; }
    confirm({
      title: `Turn off ${m.name}?`,
      message: `${m.name} will disappear from the menu for everyone in your business and no new records can be added. Everything already recorded is kept, and you can turn it back on at any time.`,
      confirmLabel: "Turn off",
      danger: true,
      onConfirm: () => void apply(m, false),
    });
  };

  if (isLoading) return <PageLoader variant="compact" />;
  if (error || !data) return <p role="alert" className="py-8 text-center text-sm text-red-600">Couldn&apos;t load your modules. Refresh to try again.</p>;

  return (
    <div className="min-w-0 space-y-4 pb-28">{/* clears the floating help buttons so the last switches stay clickable */}
      <SettingsCard title="Features & Modules" description="Choose which parts of Pesaa your business uses. What each person can do inside a module is still set in Team & Access.">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border py-3.5">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">Your plan</p>
            <p className="text-sm font-semibold text-foreground">{data.plan ? data.plan.name : "No plan selected"}</p>
          </div>
          <Link href="/settings/billing" className="ml-auto text-[13px] font-semibold text-accent hover:underline">Manage plan</Link>
        </div>
        <p className="border-b border-border py-3 text-[13px] text-muted"><strong className="text-foreground">{counts.included}</strong> included · <strong className="text-foreground">{counts.on}</strong> on · <strong className="text-foreground">{counts.off}</strong> off{counts.upgrade > 0 && <> · <strong className="text-foreground">{counts.upgrade}</strong> need an upgrade</>}{counts.restricted > 0 && <> · <strong className="text-foreground">{counts.restricted}</strong> restricted by Pesaa</>}</p>
        {!canManage && <p className="border-b border-border py-3 text-[12px] text-muted">Only an administrator can turn modules on or off. You can see what your business uses.</p>}
        <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search modules" aria-label="Search modules" />
          </div>
          <div role="group" aria-label="Filter modules" className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", filter === f.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}>{f.label}</button>)}
          </div>
        </div>
        {problem && <p role="alert" className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-700 dark:text-red-400">{problem}</p>}
        {busyKey && <p role="status" className="sr-only"><Loader2 size={12} className="animate-spin" /> Saving</p>}
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted">No modules match.</p> : (
          <ul>{rows.map((m) => <ModuleRow key={m.key} module={m} canManage={canManage} busyKey={busyKey} onToggle={toggle} />)}</ul>
        )}
      </SettingsCard>
      {dialog}
    </div>
  );
}
