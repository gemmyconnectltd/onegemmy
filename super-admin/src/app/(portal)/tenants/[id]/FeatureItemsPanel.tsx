"use client";

import { useMemo, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import type { FeatureItemStatus, TenantFeatureItem } from "@/lib/api/admin";
import { useSetTenantFeatureItem, useTenantFeatureItems } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { ReasonDialog } from "@/components/features/ReasonDialog";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";

const STATUS: Record<FeatureItemStatus, { label: string; tone: Tone }> = {
  on: { label: "On", tone: "green" },
  restricted: { label: "Restricted by Pesaa", tone: "red" },
  switched_off: { label: "Switched off for every business", tone: "slate" },
  module_off: { label: "Module not in use", tone: "amber" },
};

/** Pesaa restricts or restores one submodule or feature for this business. Records stay readable either way. */
export default function FeatureItemsPanel({ tenantId }: { tenantId: string }) {
  const query = useTenantFeatureItems(tenantId);
  const change = useSetTenantFeatureItem();
  const [target, setTarget] = useState<TenantFeatureItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => {
    const out = new Map<string, TenantFeatureItem[]>();
    for (const item of query.data ?? []) out.set(item.module, [...(out.get(item.module) ?? []), item]);
    return [...out.entries()];
  }, [query.data]);

  const restore = (item: TenantFeatureItem) => {
    setError(null);
    change.mutate({ tenantId, key: item.key, restricted: false }, { onError: (e: unknown) => setError((e as { detail?: string })?.detail ?? "Could not restore.") });
  };
  const restrict = async (reason: string) => {
    if (!target) return;
    setError(null);
    try { await change.mutateAsync({ tenantId, key: target.key, restricted: true, reason }); setTarget(null); }
    catch (e: unknown) { setError((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Could not restrict."); }
  };

  return <div>
    <div className="border-b border-border px-5 py-4">
      <h2 className="text-sm font-bold text-foreground">Submodules &amp; features</h2>
      <p className="mt-0.5 text-[11px] text-muted">Restrict one part of a module for this business only. The rest of the module keeps working, existing records stay readable and nothing is deleted. Restricting a submodule covers every feature inside it.</p>
    </div>
    {error && !target && <p role="alert" className="px-5 pt-3 text-[13px] font-medium text-[var(--error)]">{error}</p>}
    {query.isLoading ? <PageLoader variant="compact" /> : query.isError ? <div className="p-5"><ErrorState message="Could not load this business's features." onRetry={() => void query.refetch()} /></div>
      : groups.length === 0 ? <div className="p-5"><EmptyState title="No submodules or features yet" description="Modules have no optional parts listed." /></div>
      : groups.map(([module, items]) => <section key={module} aria-label={module} className="border-b border-border last:border-b-0">
        <p className="bg-surface/60 px-5 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{module}</p>
        <ul className="divide-y divide-border">{items.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0" style={{ paddingLeft: item.parent ? 20 : 0 }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className={item.level === "submodule" ? "text-sm font-semibold" : "text-sm font-medium"}>{item.name}</p>
              <Badge tone={STATUS[item.status].tone} dot>{item.restricted_by_parent ? "Restricted with its submodule" : STATUS[item.status].label}</Badge>
            </div>
            <p className="font-mono text-[11px] text-muted">{item.key}</p>
            {item.restricted && <p className="mt-0.5 text-[12px] text-muted">Reason: {item.reason ?? "—"}{item.restricted_at ? ` · since ${fmtDateTime(item.restricted_at)}` : ""}</p>}
          </div>
          {item.restricted
            ? <Button variant="secondary" size="sm" disabled={change.isPending} onClick={() => restore(item)}><Unlock size={13} /> Restore</Button>
            : <Button variant="secondary" size="sm" disabled={change.isPending || item.restricted_by_parent} onClick={() => { setError(null); setTarget(item); }}><Lock size={13} /> Restrict…</Button>}
        </li>)}</ul>
      </section>)}
    {target && <ReasonDialog
      title={`Restrict ${target.name} for this business?`}
      message={`This business can no longer create or change ${target.name.toLowerCase()}${target.level === "submodule" ? " or anything inside it" : ""}. Existing records stay readable. You can restore it at any time.`}
      confirmLabel="Restrict" danger pending={change.isPending} error={error}
      onSubmit={(reason) => void restrict(reason)} onClose={() => setTarget(null)} />}
  </div>;
}
