"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, Eye, X } from "lucide-react";
import type { DmFilters, DmModuleInfo, DmRecord, DmSelection } from "@/lib/api";
import { useDmFilterOptions, useDmRecord, useDmRecords, useDmSavedFilters, useDmSaveFilter, useDmDeleteFilter } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { SearchBox, Pagination, thClass } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { cn } from "@/lib/utils";
import { Cell, errorText } from "./common";

export type Sel = { mode: "none" } | { mode: "ids"; ids: Set<string> } | { mode: "matching"; excluded: Set<string> };
export const NONE: Sel = { mode: "none" };
const PAGE_SIZE = 25;

export const selectedCount = (sel: Sel, total: number) => (sel.mode === "ids" ? sel.ids.size : sel.mode === "matching" ? Math.max(0, total - sel.excluded.size) : 0);
export function toSelection(sel: Sel, filters: DmFilters): DmSelection | null {
  if (sel.mode === "ids") return { mode: "ids", ids: [...sel.ids] };
  if (sel.mode === "matching") return { mode: "matching", filters, excluded_ids: [...sel.excluded] };
  return null;
}
export const hasDateLimit = (f: DmFilters) => !!(f.preset && f.preset !== "all") || !!f.from || !!f.to;

/** The business's records for one module: filters, a server-paged table, and a selection that knows the difference between "this page" and "everything that matches". */
export function RecordExplorer({ tenantId, info, filters, onFilters, sel, onSel, onTotal, currency }: {
  tenantId: string; info: DmModuleInfo; filters: DmFilters; onFilters: (f: DmFilters) => void; sel: Sel; onSel: (s: Sel) => void; onTotal: (n: number) => void; currency?: string;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(info.default_sort);
  const [desc, setDesc] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(String(filters.search ?? ""));
  const [detail, setDetail] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const options = useDmFilterOptions(tenantId, info.key).data;
  const q = useDmRecords(tenantId, info.key, { filters, page, page_size: PAGE_SIZE, sort, descending: desc });
  const rows = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  useEffect(() => { onTotal(total); }, [total, onTotal]);
  useEffect(() => { const t = setTimeout(() => { if ((filters.search ?? "") !== search) { setPage(1); onSel(NONE); onFilters({ ...filters, search: search || undefined }); } }, 350); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: DmFilters) => { setPage(1); onSel(NONE); onFilters({ ...filters, ...patch }); };
  const visible = info.columns.filter((c) => !hidden.has(c.key));
  const pageIds = rows.map((r) => r.id);
  const isSelected = (id: string) => sel.mode === "ids" ? sel.ids.has(id) : sel.mode === "matching" ? !sel.excluded.has(id) : false;
  const pageAll = rows.length > 0 && pageIds.every(isSelected);
  const toggle = (id: string) => {
    if (sel.mode === "matching") { const next = new Set(sel.excluded); if (next.has(id)) next.delete(id); else next.add(id); onSel({ mode: "matching", excluded: next }); return; }
    const next = new Set(sel.mode === "ids" ? sel.ids : []);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSel(next.size ? { mode: "ids", ids: next } : NONE);
  };
  const togglePage = () => {
    if (sel.mode === "matching") { const next = new Set(sel.excluded); pageIds.forEach((i) => (pageAll ? next.add(i) : next.delete(i))); onSel({ mode: "matching", excluded: next }); return; }
    const next = new Set(sel.mode === "ids" ? sel.ids : []);
    pageIds.forEach((i) => (pageAll ? next.delete(i) : next.add(i)));
    onSel(next.size ? { mode: "ids", ids: next } : NONE);
  };
  const sortBy = (key: string) => { if (!info.sorts.includes(key)) return; if (sort === key) setDesc(!desc); else { setSort(key); setDesc(false); } setPage(1); };
  const dateTypes = info.date_types;
  const preset = String(filters.preset ?? "all");
  const onPage = rows.filter((r) => isSelected(r.id)).length;

  return (
    <section className="min-w-0 space-y-3" aria-label={`${info.label} records`}>
      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2">
          {dateTypes.length > 0 && (
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">Date type
              <Select aria-label="Date type" className="w-auto" value={String(filters.date_type ?? info.default_date_type ?? "")} onChange={(e) => change({ date_type: e.target.value })}>{dateTypes.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</Select></label>
          )}
          {dateTypes.length > 0 && (
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">Dates
              <Select aria-label="Date range" className="w-auto" value={preset} onChange={(e) => change({ preset: e.target.value, from: undefined, to: undefined })}>{info.presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select></label>
          )}
          {preset === "custom" && <>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">From<Input type="date" className="w-auto" value={String(filters.from ?? "")} onChange={(e) => change({ from: e.target.value })} /></label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">To<Input type="date" className="w-auto" value={String(filters.to ?? "")} onChange={(e) => change({ to: e.target.value })} /></label>
          </>}
          <div className="min-w-[12rem] flex-1"><SearchBox value={search} onChange={setSearch} placeholder={`Search ${info.label.toLowerCase()}`} /></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {info.filters.map((f) => {
            const list = options?.[f.key];
            if (f.key === "payment_status") return <label key={f.key} className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">{f.label}<Select aria-label={f.label} className="w-auto" value={String(filters.payment_status ?? "")} onChange={(e) => change({ payment_status: e.target.value || undefined })}><option value="">Any</option><option value="Paid">Paid</option><option value="PartiallyPaid">Partly paid</option><option value="Unpaid">Unpaid</option></Select></label>;
            if (f.key === "approval_status") return <label key={f.key} className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">{f.label}<Select aria-label={f.label} className="w-auto" value={String(filters.approval_status ?? "")} onChange={(e) => change({ approval_status: e.target.value || undefined })}><option value="">Any</option><option value="awaiting">Awaiting approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="not_required">Not required</option></Select></label>;
            if (f.key === "reference") return <label key={f.key} className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">{f.label}<Input aria-label={f.label} className="w-40" defaultValue={String(filters.reference ?? "")} onBlur={(e) => e.target.value !== String(filters.reference ?? "") && change({ reference: e.target.value || undefined })} placeholder="Contains…" /></label>;
            if (!list?.length) return null;
            return <label key={f.key} className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">{f.label}<Select aria-label={f.label} className="w-auto max-w-[12rem]" value={String(filters[f.key] ?? "")} onChange={(e) => change({ [f.key]: e.target.value || undefined })}><option value="">Any</option>{list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></label>;
          })}
          {info.key === "sales" && <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted">Archived<Select aria-label="Archived" className="w-auto" value={String(filters.archived ?? "")} onChange={(e) => change({ archived: e.target.value || undefined })}><option value="">Both</option><option value="active">Not archived</option><option value="archived">Archived only</option></Select></label>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SavedFilters module={info.key} tenantId={tenantId} filters={filters} onApply={(f) => { setSearch(String(f.search ?? "")); setPage(1); onSel(NONE); onFilters(f); }} />
            <div className="relative">
              <Button variant="outline" size="sm" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((v) => !v)}>Columns</Button>
              {columnsOpen && <div className="absolute right-0 z-20 mt-1 w-48 space-y-1 rounded-lg border border-border bg-card p-2 shadow-lg">{info.columns.map((c) => <label key={c.key} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />{c.label || "Picture"}</label>)}</div>}
            </div>
          </div>
        </div>
        {q.data && <p className="text-[11.5px] text-muted">Dates are in the business&apos;s time zone ({q.data.timezone}){q.data.range[0] || q.data.range[1] ? `, ${q.data.range[0] ?? "start"} to ${q.data.range[1] ?? "today"}` : ", all dates"}.</p>}
      </div>

      {q.isLoading && <PageLoader />}
      {q.error && <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState title="No records match" description="Change the filters, or the date range, to see records." />}
      {q.data && rows.length > 0 && (
        <div className="space-y-2">
          {sel.mode !== "none" && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-[13px]">
              {sel.mode === "matching"
                ? <span><strong>All {selectedCount(sel, total).toLocaleString()} matching records</strong> are selected{sel.excluded.size ? ` (${sel.excluded.size} left out)` : ""}.</span>
                : <span><strong>{onPage} record{onPage === 1 ? "" : "s"} selected on this page</strong>{sel.ids.size > onPage ? `, ${sel.ids.size} in all` : ""}.</span>}
              {sel.mode === "ids" && pageAll && total > rows.length && <Button size="sm" variant="outline" onClick={() => onSel({ mode: "matching", excluded: new Set() })}>Select all {total.toLocaleString()} matching records</Button>}
              <Button size="sm" variant="ghost" onClick={() => onSel(NONE)}><X size={13} /> Clear selection</Button>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <TableScroll label={`${info.label} records`}>
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="border-b border-border bg-surface/60"><tr>
                  <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select this page" checked={pageAll} onChange={togglePage} /></th>
                  {visible.map((c) => <th key={c.key} scope="col" aria-sort={sort === c.key ? (desc ? "descending" : "ascending") : undefined} className={cn(thClass, c.align === "right" && "text-right")}>
                    {info.sorts.includes(c.key) ? <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground">{c.label}{sort === c.key && (desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</button> : c.label}</th>)}
                  <th className="w-12 px-3" />
                </tr></thead>
                <tbody className="divide-y divide-border">{rows.map((r) => (
                  <tr key={r.id} className={cn("hover:bg-surface/50", isSelected(r.id) && "bg-accent/5")}>
                    <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${r.label}`} checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    {visible.map((c) => <td key={c.key} className={cn("whitespace-nowrap px-4 py-2.5", c.align === "right" && "text-right")}><Cell kind={c.kind} value={r[c.key]} currency={c.kind === "money" ? String(r.currency ?? currency ?? "") : undefined} /></td>)}
                    <td className="px-3 py-2.5"><button type="button" aria-label={`Details of ${r.label}`} onClick={() => setDetail(r.id)} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"><Eye size={14} /></button></td>
                  </tr>))}</tbody>
              </table>
            </TableScroll>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} noun={info.noun} />
        </div>
      )}
      {detail && <RecordDrawer tenantId={tenantId} module={info.key} id={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function RecordDrawer({ tenantId, module, id, onClose }: { tenantId: string; module: string; id: string; onClose: () => void }) {
  const q = useDmRecord(tenantId, module, id);
  return (
    <Drawer open onClose={onClose} title={q.data?.label ?? "Record"} description="Details and what depends on it" size="md">
      <div className="space-y-4 p-4">
        {q.isLoading && <PageLoader />}
        {q.error && <ErrorState message={errorText(q.error)} />}
        {q.data && <>
          <dl className="space-y-2 text-sm">{q.data.fields.map((f) => <div key={f.key} className="flex justify-between gap-3"><dt className="text-muted">{f.label}</dt><dd className="min-w-0 text-right"><Cell kind={f.kind === "image" ? "text" : f.kind} value={f.value} /></dd></div>)}</dl>
          <div><p className="mb-1 text-xs font-semibold text-muted">Other records that depend on it</p>
            {Object.keys(q.data.related).length === 0 ? <p className="text-sm">Nothing depends on this record.</p> : <ul className="space-y-1 text-sm">{Object.entries(q.data.related).map(([k, n]) => <li key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="tabular-nums">{n}</span></li>)}</ul>}</div>
        </>}
      </div>
    </Drawer>
  );
}

function SavedFilters({ module, tenantId, filters, onApply }: { module: string; tenantId: string; filters: DmFilters; onApply: (f: DmFilters) => void }) {
  const savedQuery = useDmSavedFilters(module).data;
  const save = useDmSaveFilter();
  const del = useDmDeleteFilter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const mine = useMemo(() => (savedQuery ?? []).filter((s) => !s.tenant_id || s.tenant_id === tenantId), [savedQuery, tenantId]);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Bookmark size={13} /> Saved filters</Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 space-y-2 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-[11.5px] text-muted">A saved filter only fills in the filters. Every operation still gets a fresh preview.</p>
          {mine.length === 0 && <p className="text-sm text-muted">Nothing saved yet.</p>}
          {mine.map((s) => <div key={s.id} className="flex items-center justify-between gap-2 text-sm"><button type="button" className="truncate text-left font-medium text-accent hover:underline" onClick={() => { onApply(s.filters); setOpen(false); }}>{s.name}</button><button type="button" aria-label={`Delete ${s.name}`} onClick={() => del.mutate(s.id)} className="text-muted hover:text-red-600"><X size={13} /></button></div>)}
          <div className="flex gap-1.5 border-t border-border pt-2"><Input aria-label="Name for this filter" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this filter" /><Button size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate({ module, name: name.trim(), tenant_id: tenantId, filters }, { onSuccess: () => setName("") })}>Save</Button></div>
        </div>
      )}
    </div>
  );
}

export type { DmRecord };
