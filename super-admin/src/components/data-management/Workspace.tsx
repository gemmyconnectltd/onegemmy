"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Database, History, LifeBuoy, ListChecks } from "lucide-react";
import { OP_LABEL, type DmFilters, type DmOperation } from "@/lib/api";
import { useDmBusiness, useDmHistory, useDmMe, useDmModuleInfo, useDmModules, useDmFilterOptions, useDmPrepare } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { cn } from "@/lib/utils";
import { errorText, StatusBadge } from "./common";
import { NONE, RecordExplorer, selectedCount, toSelection, type Sel } from "./RecordExplorer";
import { OperationPanel } from "./OperationPanel";
import { OPERATION_CARDS } from "./operations";
import { BusinessRequestQueue } from "./BusinessRequestQueue";

/** One workspace for one business: its header, the modules with their real record counts, the records, and the operation panel.
 *  The same component serves Data Management and Businesses → Data Management, so there is only one feature. */
export function Workspace({ tenantId, embedded = false }: { tenantId: string; embedded?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const startOp = (["archive", "delete", "clean_test", "correct"] as const).find((o) => o === params.get("op"));
  const startFrom = params.get("from"), startTo = params.get("to"), startModule = params.get("module");
  const me = useDmMe();
  const business = useDmBusiness(tenantId);
  const modules = useDmModules(tenantId);
  const [moduleKey, setModuleKey] = useState<string>(startModule ?? "sales");
  const infoQuery = useDmModuleInfo(moduleKey);
  // While a new module's description loads, the previous one is still around: never use it for the module just chosen.
  const info = { ...infoQuery, data: infoQuery.data?.key === moduleKey ? infoQuery.data : undefined };
  const options = useDmFilterOptions(tenantId, moduleKey).data;
  const [filtersByModule, setFiltersByModule] = useState<Record<string, DmFilters>>(() =>
    startModule && startFrom && startTo ? { [startModule]: { date_type: params.get("date_type") ?? undefined, preset: "custom", from: startFrom, to: startTo } } : {});
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
  const recentOperations = useDmHistory(1, { tenant_id: tenantId }, { enabled: perms.includes("data:history") });

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
      {embedded && (
        <section aria-label="Data operations" className="space-y-2">
          <div><h2 className="pesaa-card-title">Data Operations</h2><p className="text-[12px] text-muted">Powerful tools to manage, correct, clean and organize this business&apos;s data safely. Each one starts with a preview.</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{OPERATION_CARDS.map((c) => { const Icon = c.icon; return (
            <Link key={c.key} href={`/data-management/new?op=${c.key}&tenant=${tenantId}`} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 hover:border-accent/40 hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-accent">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={15} aria-hidden /></span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{c.title}</span><span className="block truncate text-[11px] text-muted">{c.description}</span></span></Link>); })}</div>
        </section>
      )}

      {!embedded && <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.logo_url ? <img src={b.logo_url.startsWith("http") ? b.logo_url : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:8000"}${b.logo_url}`} alt="" className="h-11 w-11 rounded-lg border border-border object-cover" />
            : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-base font-bold text-accent" aria-hidden>{b.name.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0">
            <Link href={`/tenants/${encodeURIComponent(tenantId)}?tab=overview`} className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">
              <ArrowLeft size={13} /> Business workspace
            </Link>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Data Management</p>
            <h1 className="truncate text-lg font-bold">{b.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted"><Badge tone={b.status === "Active" ? "green" : "red"} dot>{b.status}</Badge><span>{b.slug}</span><span className="font-mono">{b.id.slice(0, 8)}</span><span>{b.timezone}</span></p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/data-management/operations?tenant=${tenantId}`}><Button variant="outline" size="sm"><History size={14} /> Operation history</Button></Link>
          <Link href={`/data-management/recovery?tenant=${tenantId}`}><Button variant="outline" size="sm"><LifeBuoy size={14} /> Backups &amp; recovery</Button></Link>
        </div>
      </header>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3.5"><p className="flex items-center gap-2 text-[12px] font-medium text-muted"><Database size={15} />Business modules</p><p className="mt-1 text-xl font-semibold tabular-nums">{moduleList?.length ?? 0}</p></div>
        <div className="rounded-xl border border-border bg-card p-3.5"><p className="flex items-center gap-2 text-[12px] font-medium text-muted"><ListChecks size={15} />Records across modules</p><p className="mt-1 text-xl font-semibold tabular-nums">{(moduleList ?? []).reduce((sum, module) => sum + module.count, 0).toLocaleString()}</p></div>
        <div className="rounded-xl border border-border bg-card p-3.5"><p className="text-[12px] font-medium text-muted">Selected in {info.data?.label ?? "current module"}</p><p className="mt-1 text-xl font-semibold tabular-nums">{count.toLocaleString()}</p></div>
      </div>

      {(perms.includes("data:preview") || perms.includes("data:approve")) && <BusinessRequestQueue tenantId={tenantId} canPreview={perms.includes("data:preview")} canReject={perms.includes("data:approve")} />}

      {startOp && <Notice tone="blue"><strong>{OP_LABEL[startOp]}.</strong> Choose a module, then the records, and prepare a preview. Nothing changes until the preview has been checked{startOp === "archive" ? "" : " and approved"}.</Notice>}

      {info.data && (perms.includes("data:preview")
        ? <OperationPanel initialOp={startOp} info={info.data} sel={sel} count={count} filters={filters} tenantId={tenantId} salespeople={options?.salesperson_id ?? options?.created_by ?? []} busy={prepare.isPending} error={error} onPrepare={onPrepare} />
        : <Notice tone="amber">You can look at records, but you need the Preview operations permission to plan anything.</Notice>)}

      <div className="@container">
        <div className="grid gap-4 @4xl:grid-cols-[13.5rem_minmax(0,1fr)]">
          <nav aria-label="Modules" className="min-w-0 @4xl:self-start">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 @4xl:hidden">
              {(modules.data ?? []).map((m) => <button key={m.key} type="button" aria-current={m.key === moduleKey ? "page" : undefined} onClick={() => chooseModule(m.key)}
                className={cn("flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", m.key === moduleKey ? "border-primary bg-primary text-white" : "border-border bg-card")}>{m.label}<span className={cn("text-[11px]", m.key === moduleKey ? "text-white/80" : "text-muted")}>{m.count.toLocaleString()}</span></button>)}
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card @4xl:block">
              {modules.isLoading && <PageLoader />}
              {groups.map(([group, items]) => (
                <div key={group} className="border-b border-border py-1.5 last:border-b-0">
                  {items.length > 1 && <p className="px-3 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{group}</p>}
                  {items.map((m) => (
                    <button key={m.key} type="button" aria-current={m.key === moduleKey ? "page" : undefined} onClick={() => chooseModule(m.key)}
                      data-active={m.key === moduleKey || undefined}
                      className="pesaa-nav-row flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-semibold">
                      <span className="min-w-0 truncate">{m.label}</span><span className={cn("flex-shrink-0 text-[11.5px] tabular-nums", m.key === moduleKey ? "text-white/80" : "text-muted")}>{m.count.toLocaleString()}</span>
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

      {perms.includes("data:history") && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="pesaa-card-title">Recent operations</h2><p className="mt-0.5 text-[12px] text-muted">A short view of the auditable work on this business.</p></div>
          <Link href={`/data-management/operations?tenant=${tenantId}`}><Button variant="outline" size="sm"><History size={14} /> Full history</Button></Link>
        </div>
        {recentOperations.isLoading && <PageLoader variant="compact" />}
        {recentOperations.error && <ErrorState message={errorText(recentOperations.error)} onRetry={() => void recentOperations.refetch()} />}
        {recentOperations.data?.items.length === 0 && <p className="py-4 text-center text-sm text-muted">No operations recorded for this business.</p>}
        {recentOperations.data && recentOperations.data.items.length > 0 && <div className="overflow-hidden rounded-lg border border-border"><TableScroll label="Recent operations"><table className="w-full min-w-[600px] text-left text-[13px]">
          <thead className="border-b border-border bg-surface/60 text-[11px] font-semibold text-muted"><tr><th scope="col" className="px-3 py-2.5">Reference</th><th scope="col" className="px-3 py-2.5">Module</th><th scope="col" className="px-3 py-2.5">Action</th><th scope="col" className="px-3 py-2.5">Date</th><th scope="col" className="px-3 py-2.5">Selected</th><th scope="col" className="px-3 py-2.5">Status</th></tr></thead>
          <tbody className="divide-y divide-border">{recentOperations.data.items.slice(0, 5).map((operation) => <tr key={operation.id} className="hover:bg-surface/50">
            <td className="px-3 py-2.5 font-mono"><Link className="font-semibold text-accent hover:underline" href={`/data-management/operations/${operation.id}`}>{operation.reference}</Link></td>
            <td className="px-3 py-2.5 capitalize">{operation.module.replaceAll("_", " ")}</td><td className="px-3 py-2.5 capitalize">{operation.operation.replaceAll("_", " ")}</td>
            <td className="whitespace-nowrap px-3 py-2.5"><time dateTime={operation.created_at}>{operation.created_at.slice(0, 10)}</time></td><td className="px-3 py-2.5 tabular-nums">{operation.selected.toLocaleString()}</td><td className="px-3 py-2.5"><StatusBadge status={operation.status} /></td>
          </tr>)}</tbody>
        </table></TableScroll></div>}
      </section>}
    </div>
  );
}
