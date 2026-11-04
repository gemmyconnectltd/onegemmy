"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, History, Tag, ArrowLeftRight, FileText } from "lucide-react";
import { useProductHistory, useWorkspaceBranches } from "@/lib/api/hooks";
import { productHistoryApi, type ProductActivity, type ProductHistoryFilters } from "@/lib/api/productHistory";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/date";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Drawer } from "@/components/ui/Drawer";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { ALL_TIME, periodRange, type PeriodValue } from "@/lib/period";

import { useDebouncedValue } from "@/lib/useDebouncedValue";

const categories = [["all", "All activities"], ["movements", "Stock movements"], ["prices", "Price changes"], ["updates", "Product updates"], ["transfers", "Transfers"], ["returns", "Returns"]];
const titles: Record<string, string> = {sale: "Sale", purchase: "Purchase order", receipt: "Stock received", transfer: "Stock transferred", customer_return: "Customer return", supplier_return: "Supplier return", product_created: "Product created", purchase_price: "Receipt price updated"};
export const activityTitle = (e: ProductActivity) => e.type === "product_event" ? String(e.details.summary ?? "Product updated") : titles[e.type] ?? e.type;
const date = fmtDateTime;
const display = (value: unknown) => value == null ? "Not recorded" : typeof value === "object" ? JSON.stringify(value) : String(value);
function sourceHref(e: ProductActivity) {
  if (!e.source_id) return null;
  if (e.source === "purchase") return `/procurement/orders/${e.source_id}`;
  if (e.source === "sale") return `/sales/orders/${e.source_id}`;
  if (e.source === "transfer") return `/inventory/transfers/${e.source_id}`;
  return null;
}
export function ProductActivityView({id, kind, category: initialCategory = "all", compact = false}: {id: string; name: string; kind?: string; category?: string; compact?: boolean}) {
  const { currencySymbol } = useAppConfig();
  const {activeBranchId} = useAuth();
  const [branchPage, setBranchPage] = useState(1);
  const branches = useWorkspaceBranches(branchPage);
  const [branch, setBranch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const [period, setPeriod] = useState<PeriodValue>(ALL_TIME);
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selected, setSelected] = useState<ProductActivity | null>(null);
  const range = periodRange(period);
  const filters: ProductHistoryFilters = {category, kind, search: debounced || undefined,
    from_date: range.from, to_date: range.to, actor_id: actor || undefined, branch_id: branch || undefined};
  const query = useProductHistory(id, page, filters);
  const money = (v: unknown, code?: unknown) => code ? `${code} ${Number(v).toLocaleString(undefined, {minimumFractionDigits: 2})}` : fmtMoney(Number(v), currencySymbol);
  const events = query.data?.items ?? [];
  const isTable = kind === "sale" || kind === "purchase" || kind === "transfer";
  const choose = (value: string) => {setCategory(value); setPage(1);};
  return <div className={compact || kind ? "space-y-4" : "grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"}>
    {!kind && !compact && <aside className="self-start lg:sticky lg:top-24 rounded-xl border border-border bg-card p-3">
      <div className="lg:hidden"><Field label="Activity category"><Select value={category} onChange={e => choose(e.target.value)}>{categories.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></Field></div>
      <nav aria-label="Activity categories" className="hidden space-y-1 lg:block">{categories.map(([key,label]) => <button key={key} onClick={() => choose(key)} aria-pressed={category===key} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm ${category===key ? "bg-surface text-accent font-semibold" : "text-muted hover:bg-surface"}`}><span>{label}</span><span>{key === "all" ? Object.values(query.data?.counts ?? {}).reduce((a,b)=>a+b,0) : query.data?.counts[key] ?? 0}</span></button>)}</nav>
    </aside>}
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Transaction reference"><Input placeholder="Search reference…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} /></Field>
        {!activeBranchId && <div className="space-y-1"><Field label="Branch"><Select value={branch} onChange={e=>{setBranch(e.target.value);setPage(1);}}><option value="">All authorized branches</option>{branch && !branches.data?.items.some(b=>b.id===branch) && <option value={branch}>Selected branch</option>}{branches.data?.items.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>{(branchPage>1 || (branches.data?.total??0)>20) && <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={branchPage===1} onClick={()=>setBranchPage(p=>p-1)}>Previous branches</Button><Button size="sm" variant="ghost" disabled={branchPage*20>=(branches.data?.total??0)} onClick={()=>setBranchPage(p=>p+1)}>More branches</Button></div>}</div>}
        <PeriodFilter value={period} onChange={v=>{setPeriod(v);setPage(1);}} label="Activity date" />
        {actor && <Button variant="secondary" onClick={()=>{setActor("");setPage(1);}}>Clear person filter</Button>}
        <Button variant="secondary" disabled={exporting || query.isLoading} onClick={async()=>{setExporting(true);setExportError("");try{await productHistoryApi.export(id,filters);}catch(e){setExportError((e as {detail?:string}).detail||"Export failed. Try again.");}finally{setExporting(false);}}}>{exporting?"Exporting…":"Export history"}</Button>
      </div>
      {exportError && <p role="alert" className="text-sm text-red-600">{exportError}</p>}
      <p className="text-xs text-muted">Dates follow your business timezone. Only authorized records are included. {actor && "Filtered to the selected person."}</p>
      {query.isLoading ? <PageLoader variant="compact" /> : query.error ? <div role="alert" className="rounded-xl border border-border bg-card p-6"><p>{(query.error as {detail?:string}).detail || query.error.message || "Could not load product activity."}</p><Button variant="secondary" onClick={()=>void query.refetch()}>Try again</Button></div> : !events.length ? <div className="rounded-xl border border-border bg-card p-8 text-center"><History className="mx-auto mb-3 text-muted"/><h3 className="font-semibold">No activity found</h3><p className="mt-2 text-sm text-muted">No recorded activity matches these filters. Older actions may not have an audit record.</p></div> : isTable ? <TableScroll><table className="w-full"><thead><tr>{["Reference","Date","Party / route","Branch","Quantity","Price / received","Status","Performed by",""].map(h=><th key={h} className="text-left">{h}</th>)}</tr></thead><tbody>{events.map(e=><tr key={e.id}><td><button className="font-semibold text-accent hover:underline" onClick={()=>setSelected(e)}>{e.reference || activityTitle(e)}</button></td><td>{date(e.occurred_at)}</td><td>{display(e.details.customer ?? e.details.supplier ?? e.branch)}{e.other_branch && ` → ${e.other_branch}`}</td><td>{e.branch || "Not recorded"}</td><td className="text-right tabular-nums">{e.quantity}</td><td className="text-right tabular-nums">{kind === "sale" ? <>{money(e.details.unit_price,e.details.currency)} each<br/>{money(e.details.total,e.details.currency)} total</> : kind === "purchase" ? <>{money(e.details.unit_cost,e.details.currency)} each<br/>{display(e.details.received_quantity)} received</> : "Business total unchanged"}</td><td>{e.status}</td><td>{e.actor||"Not recorded"}</td><td><Button variant="ghost" onClick={()=>setSelected(e)}>Details</Button></td></tr>)}</tbody></table></TableScroll> : <ol className="space-y-3">{events.map(e=>{
        const changes = e.details.changes;
        const before = changes?.before?.stock; const after = changes?.after?.stock;
        const delta = e.quantity_change ?? (before != null && after != null ? Number(after)-Number(before) : null);
        const Icon = e.category === "prices" ? Tag : e.type === "transfer" ? ArrowLeftRight : delta != null && delta > 0 ? ArrowDownLeft : delta != null && delta < 0 ? ArrowUpRight : FileText;
        return <li key={e.id}><button onClick={()=>setSelected(e)} className="flex w-full gap-4 rounded-xl border border-border bg-card p-4 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface ${delta != null && delta < 0 ? "text-red-600" : delta != null && delta > 0 ? "text-green-600" : "text-muted"}`}><Icon size={19}/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold">{activityTitle(e)}</span><time className="text-xs text-muted">{date(e.occurred_at)}</time></span><span className="mt-1 block text-sm text-muted">{[e.reference, e.branch, e.other_branch && `→ ${e.other_branch}`, e.status].filter(Boolean).join(" · ") || "Business product record"}</span>{delta != null && <span className={`mt-2 block text-sm font-semibold ${delta < 0 ? "text-red-600" : delta > 0 ? "text-green-600" : "text-muted"}`}>{delta>0?"+":""}{delta} stock units{before != null && after != null ? ` · ${before} → ${after}` : ""}</span>}{e.quantity != null && delta == null && <span className="mt-2 block text-sm">Quantity: {e.quantity} · Stock impact not recorded</span>}{changes?.after && <span className="mt-2 block space-y-1 text-sm">{Object.entries(changes.after).filter(([k])=>k!=="stock").map(([k,v])=><span className="block break-words" key={k}>{k.replaceAll("_"," ")}: {display(changes.before?.[k])} → {display(v)}</span>)}</span>}<span className="mt-2 block text-xs text-muted">{e.actor || "Performer not recorded"}{changes?.reason ? ` · ${changes.reason}` : ""}</span></span></button></li>;
      })}</ol>}
      <Pagination page={page} pageSize={20} total={query.data?.total ?? 0} onPageChange={setPage} itemLabel="activities" />
    </section>
    <Drawer open={!!selected} onClose={()=>setSelected(null)} title={selected ? activityTitle(selected) : "Activity details"} size="lg">
      {selected && <div className="space-y-6 p-6"><dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">{Object.entries({Type:selected.type,Date:date(selected.occurred_at),Reference:selected.reference,Status:selected.status,Branch:selected.branch,Destination:selected.other_branch,"Performed by":selected.actor,Quantity:selected.quantity,"Stock change":selected.quantity_change}).map(([key,value])=><div key={key}><dt className="text-muted">{key}</dt><dd className="mt-1 break-words font-medium">{display(value)}</dd></div>)}</dl>
        {selected.actor_id && <Button variant="secondary" onClick={()=>{setActor(selected.actor_id!);setPage(1);setSelected(null);}}>Filter by this person</Button>}
        {sourceHref(selected) && <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline" href={sourceHref(selected)!}>Open original transaction →</Link>}
        {selected.details.changes && <TableScroll><table className="w-full text-sm"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{Object.keys(selected.details.changes.after||{}).map(key=><tr key={key}><td>{key.replaceAll("_"," ")}</td><td>{display(selected.details.changes?.before?.[key])}</td><td>{display(selected.details.changes?.after?.[key])}</td></tr>)}</tbody></table></TableScroll>}
        <h3 className="pesaa-card-title">Recorded values</h3><dl className="space-y-3 text-sm">{Object.entries(selected.details).filter(([k])=>!k.endsWith("_id") && k!=="changes").map(([key,value])=><div key={key}><dt className="font-medium">{key.replaceAll("_"," ")}</dt><dd className="mt-1 break-words text-muted">{display(value)}</dd></div>)}</dl>
        <p className="text-xs text-muted">History is read-only. Use the original transaction or an authorized adjustment to record corrections.</p>
      </div>}
    </Drawer>
  </div>;
}
