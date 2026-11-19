"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, History, Power, PowerOff } from "lucide-react";
import type { FeatureItemNode, FeatureTreeModule } from "@/lib/api/admin";
import { useFeatureItemHistory, useFeatureTree, useUpdateFeatureItem } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, SearchBox, thClass } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { ReasonDialog } from "./ReasonDialog";

type Row = { node: FeatureItemNode; depth: number; offVia: string | null };

const matches = (n: FeatureItemNode, q: string): boolean =>
  `${n.name} ${n.key}`.toLowerCase().includes(q) || n.children.some((c) => matches(c, q));

function flatten(nodes: FeatureItemNode[], depth: number, offVia: string | null, q: string): Row[] {
  return nodes.filter((n) => !q || matches(n, q)).flatMap((n) => [
    { node: n, depth, offVia },
    ...flatten(n.children, depth + 1, offVia ?? (n.is_active ? null : n.name), q),
  ]);
}

/** Modules with the submodules and features inside them. Pesaa switches a part off for every business here;
 *  one business at a time is on that business's Features tab. */
export function FeatureTree({ focus }: { focus?: string }) {
  const query = useFeatureTree();
  const update = useUpdateFeatureItem();
  const [q, setQ] = useState("");
  const focusModule = focus?.split(".")[0];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (focus && query.data) document.getElementById(`part-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, query.data]);
  const [target, setTarget] = useState<FeatureItemNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<FeatureItemNode | null>(null);
  const needle = q.trim().toLowerCase();
  const modules = useMemo(() => (query.data ?? []).filter((m) => m.children.length > 0
    && (!needle || `${m.name} ${m.key}`.toLowerCase().includes(needle) || m.children.some((c) => matches(c, needle)))), [query.data, needle]);

  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <ErrorState message="Could not load submodules and features." onRetry={() => void query.refetch()} />;

  const isOpen = (m: FeatureTreeModule) => !!needle || (open[m.key] ?? m.key === focusModule);
  const submit = async (reason: string) => {
    if (!target) return;
    setError(null);
    try {
      await update.mutateAsync({ key: target.key, data: { is_active: !target.is_active, reason, ...(target.is_active ? { confirm_key: target.key } : {}) } });
      setTarget(null);
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Could not save.");
    }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={q} onChange={setQ} placeholder="Search submodules and features" />
      <Button variant="secondary" size="sm" onClick={() => setOpen(Object.fromEntries(modules.map((m) => [m.key, true])))}>Expand all</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(Object.fromEntries(modules.map((m) => [m.key, false])))}>Collapse all</Button>
    </div>
    {modules.length === 0 ? <EmptyState title="Nothing matches" description="Try another name or key." /> : <DataCard label="Submodules and features">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead><tr className="border-b border-border">
          <th scope="col" className={thClass}>Name and key</th><th scope="col" className={thClass}>Level</th>
          <th scope="col" className={thClass}>Platform status</th><th scope="col" className={thClass}>Covers</th>
          <th scope="col" className={`${thClass} text-right`}>Restricted for</th><th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {modules.map((m) => <Fragment key={m.key}>
            <tr className="bg-surface/60">
              <td colSpan={6} className="px-4 py-2.5">
                <button type="button" onClick={() => setOpen({ ...open, [m.key]: !isOpen(m) })} aria-expanded={isOpen(m)}
                  className="flex items-center gap-2 text-left font-semibold">
                  <ChevronRight size={15} aria-hidden className={`transition-transform ${isOpen(m) ? "rotate-90" : ""}`} />
                  {m.name}
                  <span className="font-mono text-[11px] font-normal text-muted">{m.key}</span>
                  <span className="text-[12px] font-normal text-muted">· {m.children.length} part{m.children.length === 1 ? "" : "s"}</span>
                  {!m.is_active && <Badge tone="slate" dot>Module switched off</Badge>}
                </button>
              </td>
            </tr>
            {isOpen(m) && flatten(m.children, 1, m.is_active ? null : m.name, needle).map(({ node, depth, offVia }) => <tr key={node.key} id={`part-${node.key}`} className={node.key === focus ? "bg-accent/5" : "hover:bg-surface/50"}>
              <td className="px-4 py-3">
                <div style={{ paddingLeft: depth * 20 }}>
                  <p className={node.level === "submodule" ? "font-semibold" : "font-medium"}>{node.name}</p>
                  <p className="font-mono text-[11px] text-muted">{node.key}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{node.level === "submodule" ? "Submodule" : "Feature"}</td>
              <td className="px-4 py-3">
                {!node.is_active ? <Badge tone="slate" dot>Switched off</Badge>
                  : offVia ? <Badge tone="amber" dot>Off via {offVia}</Badge>
                  : <Badge tone="green" dot>On</Badge>}
              </td>
              <td className="px-4 py-3 text-[12px] text-muted">{node.routes.length ? <span className="font-mono">{node.routes.join(", ")}</span> : `${node.children.length} feature${node.children.length === 1 ? "" : "s"}`}</td>
              <td className="px-4 py-3 text-right tabular-nums">{node.restricted_tenants ? `${node.restricted_tenants} business${node.restricted_tenants === 1 ? "" : "es"}` : "—"}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setHistoryFor(node)} aria-label={`History of ${node.name}`}><History size={13} /></Button>
                  <Button variant={node.is_active ? "secondary" : "primary"} size="sm" onClick={() => { setError(null); setTarget(node); }}>
                    {node.is_active ? <><PowerOff size={13} /> Switch off…</> : <><Power size={13} /> Switch on…</>}
                  </Button>
                </div>
              </td>
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </DataCard>}
    <p className="text-[12px] text-muted">Only optional parts of a module are listed. A switched-off part keeps every record readable and refuses new changes; the rest of the module keeps working. To restrict a part for one business, use <Link href="/features/access" className="font-semibold text-accent hover:underline">Access by business</Link>.</p>

    {target && <ReasonDialog
      title={target.is_active ? `Switch off ${target.name} for every business?` : `Switch ${target.name} back on?`}
      message={target.is_active
        ? `Every business loses the ability to create or change ${target.name.toLowerCase()}${target.level === "submodule" ? " and everything in it" : ""}. Existing records stay readable and nothing is deleted.`
        : `Businesses whose module and plan allow it can use ${target.name} again straight away, unless Pesaa restricted it for them.`}
      confirmLabel={target.is_active ? "Switch off" : "Switch on"} danger={target.is_active}
      requireKey={target.is_active ? target.key : undefined} pending={update.isPending} error={error}
      onSubmit={(reason) => void submit(reason)} onClose={() => setTarget(null)} />}
    {historyFor && <HistoryDrawer node={historyFor} onClose={() => setHistoryFor(null)} />}
  </div>;
}

function HistoryDrawer({ node, onClose }: { node: FeatureItemNode; onClose: () => void }) {
  const query = useFeatureItemHistory(node.key);
  return <Drawer open onClose={onClose} side="right" size="lg" title={`History — ${node.name}`} description={node.key}>
    <div className="px-5 py-4">
      {query.isLoading ? <PageLoader variant="compact" /> : query.isError ? <ErrorState message="Could not load the history." onRetry={() => void query.refetch()} />
        : (query.data ?? []).length === 0 ? <EmptyState title="No changes yet" description="Switches and restrictions will appear here with who made them and why." />
        : <ul className="divide-y divide-border">{(query.data ?? []).map((h) => <li key={h.id} className="py-3 text-sm">
            <p className="font-medium">{h.summary}</p>
            <p className="text-[12px] text-muted">{h.actor ?? "Unknown"} · {h.at ? fmtDateTime(h.at) : ""}</p>
          </li>)}</ul>}
    </div>
  </Drawer>;
}
