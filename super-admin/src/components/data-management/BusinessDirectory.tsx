"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, X } from "lucide-react";
import type { DmBusinessQuery, DmBusinessRow } from "@/lib/api";
import { useDmBusinesses, useDmFacets } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { cn } from "@/lib/utils";
import { errorText } from "./common";

const SIZES = [10, 20, 50];
const COLUMNS: { key: string; label: string; sort?: string; className?: string }[] = [
  { key: "name", label: "Business", sort: "name" }, { key: "plan", label: "Plan", sort: "plan" }, { key: "country", label: "Country", sort: "country" },
  { key: "users", label: "Users", sort: "users", className: "text-right" }, { key: "branches", label: "Branches", sort: "branches", className: "text-right" },
  { key: "created_at", label: "Created at", sort: "created_at" }, { key: "status", label: "Status", sort: "status" }, { key: "action", label: "Action" },
];
const TONE = { Active: "green", Suspended: "red", Archived: "slate" } as const;
const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

/** Businesses, filtered, sorted and paged by the server. `urlSync` keeps the filters in the address bar; `onPick` replaces the link on each row. */
export function BusinessDirectory({ hrefFor, onPick, urlSync = false, title = "Select a Business", subtitle = "Choose a business to manage its data, records, and operations." }: {
  hrefFor?: (b: DmBusinessRow) => string; onPick?: (b: DmBusinessRow) => void; urlSync?: boolean; title?: string; subtitle?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const read = (k: string) => (urlSync ? params.get(k) : null) ?? "";
  const [text, setText] = useState(read("q"));
  const [q, setQ] = useState<DmBusinessQuery>(() => ({
    page: Number(read("page")) || 1, page_size: SIZES.includes(Number(read("size"))) ? Number(read("size")) : 20, search: read("q") || undefined, status: read("status") || undefined,
    plan: read("plan") || undefined, country: read("country") || undefined, sort: read("sort") || "name", descending: read("dir") === "desc",
  }));
  const facets = useDmFacets().data;
  const list = useDmBusinesses(q);
  const first = useRef(true);

  // The search box is applied half a second after typing stops, so each keystroke is not a request.
  useEffect(() => {
    const id = setTimeout(() => setQ((c) => ((c.search ?? "") === text.trim() ? c : { ...c, search: text.trim() || undefined, page: 1 })), 350);
    return () => clearTimeout(id);
  }, [text]);
  useEffect(() => {
    if (!urlSync) return;
    if (first.current) { first.current = false; return; }
    const next = new URLSearchParams(params.toString());
    const put = (k: string, v: string | undefined) => (v ? next.set(k, v) : next.delete(k));
    put("q", q.search); put("status", q.status); put("plan", q.plan); put("country", q.country); put("sort", q.sort !== "name" || q.descending ? q.sort : undefined);
    put("dir", q.descending ? "desc" : undefined); put("page", q.page > 1 ? String(q.page) : undefined); put("size", q.page_size !== 20 ? String(q.page_size) : undefined);
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `params` is only read to keep unrelated parameters
  }, [q, urlSync, pathname, router]);

  const set = (patch: Partial<DmBusinessQuery>) => setQ((c) => ({ ...c, ...patch, page: patch.page ?? 1 }));
  const sortBy = (key: string) => set({ sort: key, descending: q.sort === key ? !q.descending : false });
  const filtered = !!(q.search || q.status || q.plan || q.country);
  const clear = () => { setText(""); setQ((c) => ({ ...c, search: undefined, status: undefined, plan: undefined, country: undefined, page: 1 })); };
  const open = (b: DmBusinessRow) => (onPick ? onPick(b) : hrefFor && router.push(hrefFor(b)));
  const rows = list.data?.items ?? [];

  return (
    <section id="businesses" aria-labelledby="directory-title" className="space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 id="directory-title" className="pesaa-card-title">{title}</h2><p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p></div>
        <p className="text-[12.5px] font-semibold text-muted" aria-live="polite">{list.data ? `${list.data.total.toLocaleString()} business${list.data.total === 1 ? "" : "es"}` : "…"}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        <label className="relative min-w-[220px] flex-1 text-[11px] font-medium text-muted">Search
          <Search size={14} className="pointer-events-none absolute bottom-[11px] left-3" aria-hidden />
          <Input aria-label="Search by business name or identifier" className="mt-0.5 pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder="Business name or identifier" /></label>
        <label className="flex flex-col text-[11px] font-medium text-muted">Status<Select aria-label="Status" className="mt-0.5 w-auto" value={q.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })}><option value="">All statuses</option>{(facets?.statuses ?? ["Active", "Suspended", "Archived"]).map((s) => <option key={s}>{s}</option>)}</Select></label>
        <label className="flex flex-col text-[11px] font-medium text-muted">Plan<Select aria-label="Subscription plan" className="mt-0.5 w-auto" value={q.plan ?? ""} onChange={(e) => set({ plan: e.target.value || undefined })}><option value="">All plans</option>{(facets?.plans ?? []).map((s) => <option key={s}>{s}</option>)}</Select></label>
        <label className="flex flex-col text-[11px] font-medium text-muted">Country<Select aria-label="Country" className="mt-0.5 w-auto" value={q.country ?? ""} onChange={(e) => set({ country: e.target.value || undefined })}><option value="">All countries</option>{(facets?.countries ?? []).map((s) => <option key={s}>{s}</option>)}</Select></label>
        <Button variant="outline" size="sm" disabled={!filtered} onClick={clear}><X size={13} /> Clear filters</Button>
      </div>
      {list.error && <ErrorState message={errorText(list.error)} onRetry={() => void list.refetch()} />}
      {!list.error && list.data && rows.length === 0 && <EmptyState title="No business found" description={filtered ? "No business matches these filters. Try fewer or different ones." : "There are no businesses yet."} action={filtered ? <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button> : undefined} />}
      {!list.error && (list.isLoading || rows.length > 0) && (
        <div className={cn("overflow-hidden rounded-xl border border-border bg-card transition-opacity", list.isFetching && !list.isLoading && "opacity-70")} aria-busy={list.isFetching}>
          <TableScroll label="Businesses"><table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-border bg-surface/60"><tr>{COLUMNS.map((c) => (
              <th key={c.key} scope="col" className={cn(thClass, c.className)} aria-sort={c.sort && q.sort === c.sort ? (q.descending ? "descending" : "ascending") : undefined}>
                {c.sort ? <button type="button" onClick={() => sortBy(c.sort!)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground">{c.label}
                  {q.sort === c.sort ? (q.descending ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />) : <ArrowUpDown size={12} className="opacity-40" aria-hidden />}</button> : c.label}</th>))}</tr></thead>
            <tbody className="divide-y divide-border">
              {list.isLoading && Array.from({ length: 6 }, (_, i) => (
                <tr key={i} aria-hidden>{COLUMNS.map((c) => <td key={c.key} className="px-4 py-3.5"><span className="block h-3.5 w-3/4 animate-pulse rounded bg-surface" /></td>)}</tr>))}
              {rows.map((b) => (
                <tr key={b.id} onClick={() => open(b)} className="cursor-pointer hover:bg-surface/50">
                  <td className="px-4 py-2.5"><div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[12px] font-bold text-accent" aria-hidden>{initials(b.name)}</span>
                    <span className="min-w-0">
                      {onPick ? <button type="button" onClick={(e) => { e.stopPropagation(); onPick(b); }} className="block truncate text-left font-semibold hover:underline">{b.name}</button>
                        : <Link href={hrefFor?.(b) ?? "#"} onClick={(e) => e.stopPropagation()} className="block truncate font-semibold hover:underline">{b.name}</Link>}
                      <span className="block truncate text-[11.5px] text-muted">{b.slug}</span></span></div></td>
                  <td className="px-4 py-2.5 capitalize">{b.plan ?? "—"}</td><td className="px-4 py-2.5">{b.country || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.users.toLocaleString()}</td><td className="px-4 py-2.5 text-right tabular-nums">{b.branches.toLocaleString()}</td>
                  <td className="whitespace-nowrap px-4 py-2.5"><time dateTime={b.created_at}>{new Date(b.created_at).toLocaleDateString()}</time></td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[b.status as keyof typeof TONE] ?? "slate"} dot>{b.status}</Badge></td>
                  <td className="px-4 py-2.5">{onPick ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onPick(b); }}>Select<ChevronRight size={13} /></Button>
                    : <Link href={hrefFor?.(b) ?? "#"} onClick={(e) => e.stopPropagation()} aria-label={`Open ${b.name}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-surface">Open<ChevronRight size={13} /></Link>}</td>
                </tr>))}
            </tbody>
          </table></TableScroll>
        </div>
      )}
      {list.data && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-muted">Rows per page<Select aria-label="Rows per page" className="w-auto" value={q.page_size} onChange={(e) => set({ page_size: Number(e.target.value) })}>{SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</Select></label>
          <div className="min-w-0 flex-1"><Pagination page={q.page} pageSize={q.page_size} total={list.data.total} onPage={(p) => setQ((c) => ({ ...c, page: p }))} noun="business" /></div>
        </div>
      )}
    </section>
  );
}
