"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Globe2, LayoutGrid, List, Search, Users, X } from "lucide-react";
import { countryInfo, type Continent } from "@/lib/countries";
import { cn } from "@/lib/utils";

export interface CountryRow { name: string; users: number; businesses: number }

type SortKey = "users_desc" | "users_asc" | "biz_desc" | "biz_asc" | "name_asc" | "name_desc";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "users_desc", label: "Users: High to Low" },
  { value: "users_asc", label: "Users: Low to High" },
  { value: "biz_desc", label: "Businesses: High to Low" },
  { value: "biz_asc", label: "Businesses: Low to High" },
  { value: "name_asc", label: "Country Name: A–Z" },
  { value: "name_desc", label: "Country Name: Z–A" },
];

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Share of all users, e.g. "92.3%". Zero total → "0%"; a real but tiny share never rounds down to "0%". */
export function sharePct(part: number, total: number): { text: string; value: number } {
  if (total <= 0 || part <= 0) return { text: "0%", value: 0 };
  const v = (part / total) * 100;
  const text = v >= 10 ? `${Math.round(v)}%` : v >= 0.1 ? `${v.toFixed(1)}%` : "<0.1%";
  return { text, value: v };
}

/** A real SVG flag (emoji flags show as plain letters on Windows). Unknown names fall back to a globe. */
export function Flag({ name }: { name: string }) {
  const info = countryInfo(name);
  return info ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/flags/${info.code}.svg`} alt="" width={26} height={18} loading="lazy"
      className="h-[18px] w-[26px] flex-shrink-0 rounded-[3px] object-cover ring-1 ring-black/15" />
  ) : (
    <span className="flex h-[18px] w-[26px] flex-shrink-0 items-center justify-center rounded-[3px] bg-surface"><Globe2 size={12} className="text-muted" /></span>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-surface/60 px-2 py-1">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={12} /></span>
      <div className="flex items-baseline gap-1.5 leading-tight">
        <p className="text-[13px] font-bold tabular-nums text-foreground">{value.toLocaleString("en-US")}</p>
        <p className="text-[11px] text-muted">{label}</p>
      </div>
    </div>
  );
}

const selectCls = "h-8 rounded-lg border border-border bg-card px-2.5 text-[12.5px] text-foreground outline-none transition-colors hover:border-foreground/30 focus:border-accent focus:ring-2 focus:ring-accent/20";

export function CountriesAnalytics({ rows }: { rows: CountryRow[] }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [continent, setContinent] = useState("all");
  const [country, setCountry] = useState("all");
  const [sort, setSort] = useState<SortKey>("users_desc");
  const [view, setView] = useState<"grid" | "list">("list");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {                       // debounce typing so the list isn't re-filtered on every keystroke
    const id = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totals = useMemo(() => ({
    users: rows.reduce((s, r) => s + r.users, 0),
    businesses: rows.reduce((s, r) => s + r.businesses, 0),
  }), [rows]);
  const unknown = rows.find((r) => r.name === "Unknown");

  const known = useMemo(() => rows.filter((r) => r.name !== "Unknown")
    .map((r) => ({ ...r, continent: (countryInfo(r.name)?.continent ?? "Other") as Continent | "Other" })), [rows]);
  const leader = useMemo(() => known.reduce<string | null>((best, r) => (!best || r.users > (known.find((k) => k.name === best)?.users ?? 0) ? r.name : best), null), [known]);
  const continentNames = useMemo(() => [...new Set(known.map((r) => r.continent))].sort(), [known]);
  const countryOptions = useMemo(() => known.filter((r) => continent === "all" || r.continent === continent).map((r) => r.name).sort((a, b) => a.localeCompare(b)), [known, continent]);

  const onContinent = (v: string) => {
    setContinent(v);
    if (country !== "all" && !known.some((r) => r.name === country && (v === "all" || r.continent === v))) setCountry("all");
  };

  const cmp = useMemo(() => {
    const by: Record<SortKey, (a: CountryRow, b: CountryRow) => number> = {
      users_desc: (a, b) => b.users - a.users || a.name.localeCompare(b.name),
      users_asc: (a, b) => a.users - b.users || a.name.localeCompare(b.name),
      biz_desc: (a, b) => b.businesses - a.businesses || b.users - a.users || a.name.localeCompare(b.name),
      biz_asc: (a, b) => a.businesses - b.businesses || a.users - b.users || a.name.localeCompare(b.name),
      name_asc: (a, b) => a.name.localeCompare(b.name),
      name_desc: (a, b) => b.name.localeCompare(a.name),
    };
    return by[sort];
  }, [sort]);

  const groups = useMemo(() => {
    const filtered = known.filter((r) => (continent === "all" || r.continent === continent) && (country === "all" || r.name === country)
      && (!search || r.name.toLowerCase().includes(search)));
    const map = new Map<string, typeof filtered>();
    for (const r of filtered) map.set(r.continent, [...(map.get(r.continent) ?? []), r]);
    const list = [...map.entries()].map(([name, items]) => ({
      name, items: [...items].sort(cmp), users: items.reduce((s, r) => s + r.users, 0), businesses: items.reduce((s, r) => s + r.businesses, 0),
    }));
    const key = sort.startsWith("name") ? (a: typeof list[number], b: typeof list[number]) => (sort === "name_asc" ? 1 : -1) * a.name.localeCompare(b.name)
      : sort.startsWith("biz") ? (a: typeof list[number], b: typeof list[number]) => (sort === "biz_asc" ? 1 : -1) * (a.businesses - b.businesses) || a.name.localeCompare(b.name)
      : (a: typeof list[number], b: typeof list[number]) => (sort === "users_asc" ? 1 : -1) * (a.users - b.users) || a.name.localeCompare(b.name);
    return list.sort(key);
  }, [known, continent, country, search, sort, cmp]);

  const shown = groups.reduce((s, g) => s + g.items.length, 0);
  const filtersActive = continent !== "all" || country !== "all" || searchInput !== "" || sort !== "users_desc";
  const reset = () => { setContinent("all"); setCountry("all"); setSearchInput(""); setSearch(""); setSort("users_desc"); };

  return (
    <section className="rounded-xl border border-border bg-card p-3" aria-label="Countries">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Globe2 size={14} /></span>
          <div>
            <h2 className="text-[13px] font-bold text-foreground">Countries</h2>
            <p className="text-[11px] text-muted">
              {plural(known.length, "country", "countries")} across {plural(continentNames.length, "continent", "continents")} · {plural(totals.users, "user", "users")} · {plural(totals.businesses, "business", "businesses")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Metric icon={Users} value={totals.users} label="Total Users" />
          <Metric icon={Building2} value={totals.businesses} label="Total Businesses" />
          <Metric icon={Globe2} value={known.length} label="Countries" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-[240px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search countries" aria-label="Search countries"
            className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-[12.5px] text-foreground outline-none transition-colors placeholder:text-muted/70 hover:border-foreground/30 focus:border-accent focus:ring-2 focus:ring-accent/20" />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"><X size={13} /></button>
          )}
        </div>
        <select value={continent} onChange={(e) => onContinent(e.target.value)} aria-label="Continent" className={selectCls}>
          <option value="all">All Continents</option>
          {continentNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country" className={cn(selectCls, "max-w-[180px]")}>
          <option value="all">All Countries</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" className={selectCls}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {filtersActive && <button type="button" onClick={reset} className="h-8 rounded-lg px-2.5 text-[12px] font-semibold text-accent hover:underline">Reset</button>}
        <div className="ml-auto flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="View">
          {([["grid", LayoutGrid, "Grid view"], ["list", List, "List view"]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} aria-label={label} title={label}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors", view === v ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground")}>
              <Icon size={12} />
            </button>
          ))}
        </div>
      </div>

      {/* Continents */}
      <div className="mt-2 space-y-1.5">
        {known.length === 0 && <p className="py-8 text-center text-[12.5px] text-muted">No users with a country yet</p>}
        {known.length > 0 && shown === 0 && (
          <div className="py-8 text-center text-[12.5px] text-muted">
            No countries match your filters. <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">Reset filters</button>
          </div>
        )}
        {groups.map((g) => {
          const isCollapsed = !!collapsed[g.name];
          return (
            <div key={g.name} className="rounded-lg border border-border bg-surface/30">
              <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !c[g.name] }))} aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-2 px-2 py-1 text-left">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><Globe2 size={13} /></span>
                <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">{g.name}</span>
                <span className="min-w-0 flex-1 text-right text-[11px] text-muted">
                  {plural(g.items.length, "country", "countries")} · {plural(g.users, "user", "users")} · {plural(g.businesses, "business", "businesses")}
                </span>
                <ChevronDown size={15} className={cn("flex-shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none", isCollapsed && "-rotate-90")} />
              </button>
              <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
                <div className="overflow-hidden">
                  {view === "list" ? (
                    <div className="px-2 pb-2">
                      <TableScroll><table className="w-full table-fixed border-collapse text-left text-xs">
                        <caption className="sr-only">{g.name} countries, users, businesses and share of platform users</caption>
                        <thead>
                          <tr className="border-b border-border text-[11px] text-muted">
                            <th scope="col" className="w-[52%] px-2 py-1 font-medium">Country</th>
                            <th scope="col" className="w-[16%] px-2 py-1 font-medium">Users</th>
                            <th scope="col" className="w-[20%] px-2 py-1 font-medium">Businesses</th>
                            <th scope="col" className="w-[12%] px-2 py-1 text-right font-medium" title="Share of all platform users">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((r) => (
                            <tr key={r.name} className="border-b border-border/70 last:border-0 hover:bg-accent/5">
                              <th scope="row" className="px-2 py-1 font-medium text-foreground">
                                <Link href={`/admin/tenants?country=${encodeURIComponent(r.name)}`} className="flex items-center gap-2 hover:text-accent" title={`View businesses in ${r.name}`}>
                                  <Flag name={r.name} /><span className="break-words">{r.name}</span>
                                </Link>
                              </th>
                              <td className="px-2 py-1 tabular-nums text-foreground">{r.users.toLocaleString("en-US")}</td>
                              <td className="px-2 py-1 tabular-nums text-foreground">{r.businesses.toLocaleString("en-US")}</td>
                              <td className="px-2 py-1 text-right tabular-nums text-muted">{sharePct(r.users, totals.users).text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></TableScroll>
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 gap-1.5 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {g.items.map((r) => <CountryItem key={r.name} row={r} total={totals.users} leading={r.name === leader} />)}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {unknown && (
        <p className="mt-2 text-[11px] text-muted">
          {plural(unknown.users, "user belongs", "users belong")} to {plural(unknown.businesses, "business", "businesses")} with no country set.
        </p>
      )}
    </section>
  );
}

function CountryItem({ row, total, leading }: { row: CountryRow; total: number; leading: boolean }) {
  const pct = sharePct(row.users, total);
  const bar = <div className="h-1 overflow-hidden rounded-full bg-border/70"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(pct.value > 0 ? 2 : 0, pct.value))}%` }} /></div>;
  return (
    <li>
      <Link href={`/admin/tenants?country=${encodeURIComponent(row.name)}`} title={`View businesses in ${row.name}`}
        className={cn("group block rounded-lg border bg-card px-2 py-1.5 transition-colors hover:border-accent/50 hover:bg-accent/5",
          leading ? "border-accent/40 bg-accent/5" : "border-border")}>
          <>
            <div className="flex items-center gap-2">
              <Flag name={row.name} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="break-words text-[12px] font-semibold text-foreground">{row.name}</p>
                <p className="text-[10.5px] tabular-nums text-muted">{plural(row.users, "user", "users")} · {plural(row.businesses, "business", "businesses")}</p>
              </div>
              <span className="flex-shrink-0 text-[12px] font-bold tabular-nums text-foreground">{pct.text}</span>
              <ChevronRight size={14} className="flex-shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-1">{bar}</div>
          </>
      </Link>
    </li>
  );
}
