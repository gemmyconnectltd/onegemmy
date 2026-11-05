"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, LifeBuoy } from "lucide-react";
import type { DmFilters, DmOperation } from "@/lib/api";
import { useDmBusiness, useDmMe, useDmModuleInfo, useDmModules, useDmFilterOptions, useDmPrepare } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { cn } from "@/lib/utils";
import { errorText } from "./common";
import { NONE, RecordExplorer, selectedCount, toSelection, type Sel } from "./RecordExplorer";
import { OperationPanel } from "./OperationPanel";

/** One workspace for one business: its header, the modules with their real record counts, the records, and the operation panel.
 *  The same component serves Data Management and Businesses → Data Management, so there is only one feature. */
export function Workspace({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const me = useDmMe();
  const business = useDmBusiness(tenantId);
  const modules = useDmModules(tenantId);
  const [moduleKey, setModuleKey] = useState<string>("sales");
  const infoQuery = useDmModuleInfo(moduleKey);
  // While a new module's description loads, the previous one is still around: never use it for the module just chosen.
  const info = { ...infoQuery, data: infoQuery.data?.key === moduleKey ? infoQuery.data : undefined };
  const options = useDmFilterOptions(tenantId, moduleKey).data;
  const [filtersByModule, setFiltersByModule] = useState<Record<string, DmFilters>>({});
  const [sel, setSel] = useState<Sel>(NONE);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const prepare = useDmPrepare();
  const filters = filtersByModule[moduleKey] ?? {};
  const setFilters = useCallback((f: DmFilters) => setFiltersByModule((all) => ({ ...all, [moduleKey]: f })), [moduleKey]);
  const chooseModule = (key: string) => { setModuleKey(key); setSel(NONE); setError(null); };
  const moduleList = modules.data;
  const groups = useMemo(() => { const g = new Map<string, NonNullable<typeof moduleList>>(); (moduleList ?? []).forEach((m) => g.set(m.group, [...(g.get(m.group) ?? []), m])); return [...g.entries()]; }, [moduleList]);
  const perms = me.data?.permissions ?? [];
  const count = selectedCount(sel, total);

  if (me.isLoading || business.isLoading) return <PageLoader />;
  if (!perms.includes("data:view")) return <EmptyState title="You do not have access to Data Management" description="Ask a platform administrator to give you the View business records permission." />;
  if (business.error || !business.data) return <ErrorState message={errorText(business.error)} />;
  const b = business.data;

  async function onPrepare(operation: DmOperation, payload: Record<string, unknown>) {
    setError(null);
    try {
      const op = await prepare.mutateAsync({ tenantId, module: moduleKey, operation, selection: toSelection(sel, filters), payload });
      router.push(`/data-management/operations/${op.data.id}`);
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.logo_url ? <img src={b.logo_url.startsWith("http") ? b.logo_url : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:8000"}${b.logo_url}`} alt="" className="h-11 w-11 rounded-lg border border-border object-cover" />
            : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-base font-bold text-accent" aria-hidden>{b.name.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Data Management</p>
            <h1 className="truncate text-lg font-bold">{b.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted"><Badge tone={b.status === "Active" ? "green" : "red"} dot>{b.status}</Badge><span>{b.slug}</span><span className="font-mono">{b.id.slice(0, 8)}</span><span>{b.timezone}</span></p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/data-management/operations?tenant=${tenantId}`}><Button variant="outline" size="sm"><History size={14} /> Operation history</Button></Link>
          <Link href={`/data-management/recovery?tenant=${tenantId}`}><Button variant="outline" size="sm"><LifeBuoy size={14} /> Backups &amp; recovery</Button></Link>
        </div>
      </header>

      {info.data && (perms.includes("data:preview")
        ? <OperationPanel info={info.data} sel={sel} count={count} filters={filters} tenantId={tenantId} salespeople={options?.salesperson_id ?? options?.created_by ?? []} busy={prepare.isPending} error={error} onPrepare={onPrepare} />
        : <Notice tone="amber">You can look at records, but you need the Preview operations permission to plan anything.</Notice>)}

      <div className="@container">
        <div className="grid gap-4 @4xl:grid-cols-[13.5rem_minmax(0,1fr)]">
          <nav aria-label="Modules" className="min-w-0 @4xl:self-start">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 @4xl:hidden">
              {(modules.data ?? []).map((m) => <button key={m.key} type="button" aria-current={m.key === moduleKey ? "page" : undefined} onClick={() => chooseModule(m.key)}
                className={cn("flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", m.key === moduleKey ? "border-accent bg-accent/10 text-accent" : "border-border bg-card")}>{m.label}<span className="text-[11px] text-muted">{m.count.toLocaleString()}</span></button>)}
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card @4xl:block">
              {modules.isLoading && <PageLoader />}
              {groups.map(([group, items]) => (
                <div key={group} className="border-b border-border py-1.5 last:border-b-0">
                  {items.length > 1 && <p className="px-3 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{group}</p>}
                  {items.map((m) => (
                    <button key={m.key} type="button" aria-current={m.key === moduleKey ? "page" : undefined} onClick={() => chooseModule(m.key)}
                      className={cn("pesaa-nav-row flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-semibold", m.key === moduleKey && "bg-accent/10 text-accent")}>
                      <span className="min-w-0 truncate">{m.label}</span><span className="flex-shrink-0 text-[11.5px] tabular-nums text-muted">{m.count.toLocaleString()}</span>
                    </button>))}
                </div>))}
            </div>
          </nav>

          <div className="min-w-0 space-y-3">
            {info.data?.note && <Notice tone="blue">{info.data.note}</Notice>}
            {info.isLoading && <PageLoader />}
            {info.data && <RecordExplorer key={moduleKey} tenantId={tenantId} info={info.data} filters={filters} onFilters={setFilters} sel={sel} onSel={setSel} onTotal={setTotal} currency={b.currency} />}
          </div>

        </div>
      </div>
    </div>
  );
}
