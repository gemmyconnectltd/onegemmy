"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, History, SlidersHorizontal } from "lucide-react";
import type { FeatureItemNode, FeatureTreeModule } from "@/lib/api/admin";
import { useFeatureItemHistory, useFeatureTree } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, SearchBox, thClass } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { BulkChangeDrawer } from "@/components/product-control/BulkChangeDrawer";

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
  const [q, setQ] = useState("");
  const focusModule = focus?.split(".")[0];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (focus && query.data) document.getElementById(`part-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, query.data]);
  const [historyFor, setHistoryFor] = useState<FeatureItemNode | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState(false);
  const togglePick = (key: string, name: string) => setPicked((p) => { const n = { ...p }; if (n[key]) delete n[key]; else n[key] = name; return n; });
  const needle = q.trim().toLowerCase();
  const modules = useMemo(() => (query.data ?? []).filter((m) => (!needle || `${m.name} ${m.key}`.toLowerCase().includes(needle) || m.children.some((c) => matches(c, needle)))), [query.data, needle]);

  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <ErrorState message="Could not load submodules and features." onRetry={() => void query.refetch()} />;

  const isOpen = (m: FeatureTreeModule) => !!needle || (open[m.key] ?? m.key === focusModule);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={q} onChange={setQ} placeholder="Search submodules and features" />
      <Button variant="secondary" size="sm" onClick={() => setOpen(Object.fromEntries(modules.map((m) => [m.key, true])))}>Expand all</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(Object.fromEntries(modules.map((m) => [m.key, false])))}>Collapse all</Button>
    </div>
    {Object.keys(picked).length > 0 && <div role="status" className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <span className="text-sm font-semibold">{Object.keys(picked).length} selected</span>
      <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setPicked({})}>Clear</Button><Button size="sm" onClick={() => setBulk(true)}>Change together…</Button></div>
    </div>}
    {modules.length === 0 ? <EmptyState title="Nothing matches" description="Try another name or key." /> : <DataCard label="Submodules and features">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead><tr className="border-b border-border">
          <th scope="col" className={thClass}><span className="sr-only">Select</span></th><th scope="col" className={thClass}>Name and key</th><th scope="col" className={thClass}>Level</th>
          <th scope="col" className={thClass}>Platform status</th><th scope="col" className={thClass}>Covers</th>
          <th scope="col" className={`${thClass} text-right`}>Restricted for</th><th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {modules.map((m) => <Fragment key={m.key}>
            <tr className="bg-surface/60">
              <td className="w-10 px-4 py-2.5"><input type="checkbox" aria-label={`Select ${m.name}`} checked={!!picked[m.key]} onChange={() => togglePick(m.key, m.name)} /></td>
              <td colSpan={6} className="px-4 py-2.5">
                <button type="button" onClick={() => setOpen({ ...open, [m.key]: !isOpen(m) })} aria-expanded={isOpen(m)}
                  className="flex items-center gap-2 text-left font-semibold">
                  <ChevronRight size={15} aria-hidden className={`transition-transform ${isOpen(m) ? "rotate-90" : ""}`} />
                  {m.name}
                  <span className="font-mono text-[11px] font-normal text-muted">{m.key}</span>
                  <span className="text-[12px] font-normal text-muted">· {m.children.length} part{m.children.length === 1 ? "" : "s"}</span>
                  {!m.is_active && <Badge tone="slate" dot>Module switched off</Badge>}
                </button>
                <Link href={`/features/${m.key}`} className="ml-8 text-[12px] font-semibold text-accent hover:underline">Module controls</Link>
              </td>
            </tr>
            {isOpen(m) && m.children.length === 0 && <tr><td />
              <td colSpan={6} className="px-4 py-3 text-[13px] text-muted">No parts listed yet: this module is controlled as a whole. <Link href={`/features/${m.key}`} className="font-semibold text-accent hover:underline">Open its controls</Link></td>
            </tr>}
            {isOpen(m) && flatten(m.children, 1, m.is_active ? null : m.name, needle).map(({ node, depth, offVia }) => <tr key={node.key} id={`part-${node.key}`} className={node.key === focus ? "bg-accent/5" : "hover:bg-surface/50"}>
              <td className="w-10 px-4 py-3"><input type="checkbox" aria-label={`Select ${node.name}`} checked={!!picked[node.key]} onChange={() => togglePick(node.key, node.name)} /></td>
              <td className="px-4 py-3">
                <div style={{ paddingLeft: depth * 20 }}>
                  <Link href={`/features/${node.key}`} className={(node.level === "submodule" ? "font-semibold" : "font-medium") + " hover:text-accent"}>{node.name}</Link>
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
                  <Link href={`/features/${node.key}`}><Button variant="secondary" size="sm"><SlidersHorizontal size={13} /> Controls</Button></Link>
                </div>
              </td>
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </DataCard>}
    <p className="text-[12px] text-muted">Only optional parts of a module are listed. Open a part’s controls to set its status and message, roll it out or run a beta, and decide who may create, edit, delete, approve, import or export. To restrict a part for one business, use <Link href="/features/access" className="font-semibold text-accent hover:underline">Access by business</Link>.</p>

    {bulk && <BulkChangeDrawer items={Object.entries(picked).map(([key, name]) => ({ key, name }))} onClose={() => setBulk(false)} onDone={() => { setBulk(false); setPicked({}); }} />}
    {historyFor && <HistoryDrawer node={historyFor} onClose={() => setHistoryFor(null)} />}
  </div>;
}

function HistoryDrawer({ node, onClose }: { node: FeatureItemNode; onClose: () => void }) {
  const query = useFeatureItemHistory(node.key);
  return <Drawer open onClose={onClose} side="right" size="lg" title={`History — ${node.name}`} description={node.key}>
    <div className="px-5 py-4">
      {query.isLoading ? <PageLoader variant="compact" /> : query.isError ? <ErrorState message="Could not load the history." onRetry={() => void query.refetch()} />
        : (query.data ?? []).length === 0 ? <EmptyState