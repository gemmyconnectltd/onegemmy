"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { TableScroll } from "@/components/ui/TableScroll";
import { ReceiveStockDrawer } from "@/components/inventory/WarehouseDrawers";
import type { BranchStockRow, BranchSort } from "@/lib/api/branchStock";
import type { Warehouse } from "@/lib/api/warehouses";

export type StockFilter = "all" | "low" | "out";

/** Low / Out / OK in the same line as the quantity. Semantic colours only: amber = running low, red = none left. */
export function StockPill({ status }: { status: string }) {
  if (status === "out") return <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">Out</span>;
  if (status === "low") return <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Low</span>;
  if (status === "not_sold") return <span className="inline-flex rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-border">Not sold</span>;
  return null;
}

type BranchCol = BranchSort | "products" | "after";

/** Every branch, one row each: how many products it holds, its units on hand, what is on the way to it and so what it will have
 *  once that arrives, its stock value, and how many products are low or out. The branch being shown is highlighted; a row opens
 *  that branch. Up to `initial` rows show until "Show all"; the header sorts; the footer is the business total. */
export function BranchesTable({ rows, fmt, onOpen, openLabel, activeId = null, initial = 8 }: { rows: BranchStockRow[]; fmt: (n: number) => string; onOpen?: (id: string) => void; openLabel?: string; activeId?: string | null; initial?: number }) {
  const [sort, setSort] = useState<{ by: BranchCol; desc: boolean }>({ by: "name", desc: false });
  const [all, setAll] = useState(false);
  const value = (r: BranchStockRow) => ({ name: r.name.toLowerCase(), value: r.value_cost, units: r.units, low: r.low, out: r.out, incoming: r.incoming_units, products: r.products, after: r.units + r.incoming_units })[sort.by];
  const sorted = [...rows].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * (sort.desc ? -1 : 1));
  const shown = all ? sorted : sorted.slice(0, initial);
  const sum = (f: (r: BranchStockRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const head = (by: BranchCol, label: string, right = true) => <th scope="col" aria-sort={sort.by === by ? (sort.desc ? "descending" : "ascending") : "none"} className={right ? "text-right" : "text-left"}>
    <button type="button" className="inline-flex items-center gap-1 font-semibold hover:text-foreground" onClick={() => setSort((s) => ({ by, desc: s.by === by ? !s.desc : by !== "name" }))}>
      {label}{sort.by === by && (sort.desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
    </button></th>;
  return <section aria-labelledby="branches-title" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><h2 id="branches-title" className="pesaa-card-title">Stock by branch</h2><span className="text-xs text-muted">{rows.length} branch{rows.length === 1 ? "" : "es"} · one catalogue</span></div>
    <TableScroll label="Stock by branch" mobileLayout="cards"><table className="min-w-[860px]">
      <thead><tr>{head("name", "Branch", false)}{head("products", "Products")}{head("units", "Units on hand")}{head("incoming", "On the way")}{head("after", "Will have")}{head("value", "Stock value")}{head("low", "Low")}{head("out", "Out")}<th scope="col"><span className="sr-only">Open</span></th></tr></thead>
      <tbody>{shown.map((r) => {
        const on = !!r.branch_id && r.branch_id === activeId;
        const opens = !!onOpen && !!r.branch_id && !on;
        return <tr key={r.branch_id ?? "shared"} aria-current={on || undefined} className={`${opens ? "cursor-pointer" : ""} ${on ? "bg-accent/5" : ""}`} onClick={() => opens && onOpen!(r.branch_id!)}>
          <td data-label="Branch" className="font-semibold">{opens ? <button type="button" className="text-left text-accent hover:underline" onClick={(e) => { e.stopPropagation(); onOpen!(r.branch_id!); }} title={openLabel ? `${openLabel} in ${r.name}` : undefined}>{r.name}</button>
            : <span title={r.shared ? r.warehouses.join(", ") : undefined}>{r.name}{on && <span className="ml-2 text-xs font-medium text-accent">Showing</span>}</span>}
            {r.warehouses.length > 0 && <p className="truncate text-xs font-normal text-muted">{r.warehouses.join(", ")}</p>}</td>
          <td data-label="Products" className="text-right tabular-nums">{r.products.toLocaleString()}</td>
          <td data-label="Units on hand" className="text-right font-semibold tabular-nums">{r.units.toLocaleString()}</td>
          <td data-label="On the way" className="text-right tabular-nums">{r.incoming_units ? <span title={r.incoming_transfers.join(", ")}>+{r.incoming_units.toLocaleString()}</span> : <span className="text-muted">—</span>}</td>
          <td data-label="Will have" className="text-right font-semibold tabular-nums">{(r.units + r.incoming_units).toLocaleString()}</td>
          <td data-label="Stock value" className="text-right tabular-nums">{fmt(r.value_cost)}</td>
          <td data-label="Low" className={`text-right tabular-nums ${r.low ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted"}`}>{r.low}</td>
          <td data-label="Out" className={`text-right tabular-nums ${r.out ? "font-semibold text-red-700 dark:text-red-300" : "text-muted"}`}>{r.out}</td>
          <td data-label="" className="whitespace-nowrap text-right">{opens && (openLabel ? <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">{openLabel}<ChevronRight size={16} aria-hidden /></span> : <ChevronRight size={16} className="inline text-muted" aria-hidden />)}</td>
        </tr>;
      })}</tbody>
      {rows.length > 1 && <tfoot><tr className="border-t border-border bg-surface/50 font-semibold">
        <td data-label="">All branches</td>
        <td data-label="Products" className="text-right tabular-nums text-muted" title="A product kept in several branches counts once per branch">—</td>
        <td data-label="Units on hand" className="text-right tabular-nums">{sum((r) => r.units).toLocaleString()}</td>
        <td data-label="On the way" className="text-right tabular-nums">{sum((r) => r.incoming_units) ? `+${sum((r) => r.incoming_units).toLocaleString()}` : "—"}</td>
        <td data-label="Will have" className="text-right tabular-nums">{sum((r) => r.units + r.incoming_units).toLocaleString()}</td>
        <td data-label="Stock value" className="text-right tabular-nums">{fmt(sum((r) => r.value_cost))}</td>
        <td data-label="Low" className="text-right tabular-nums">{sum((r) => r.low)}</td>
        <td data-label="Out" className="text-right tabular-nums">{sum((r) => r.out)}</td>
        <td data-label="" />
      </tr></tfoot>}
    </table></TableScroll>
    {rows.length > initial && <div className="border-t border-border px-4 py-2"><Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${rows.length} branches`}</Button></div>}
  </section>;
}

/** The green "Receive stock" action: straight into the branch's own warehouse when one branch is open, otherwise asks which. */
export function ReceiveStock({ warehouses, branchId }: { warehouses: Warehouse[]; branchId: string | null }) {
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState<Warehouse | null>(null);
  const active = warehouses.filter((w) => w.is_active);
  const own = branchId ? active.filter((w) => w.branch_id === branchId) : active;
  const open = () => (own.length === 1 ? setTarget(own[0]) : setChoosing(true));
  return <>
    <Button onClick={open} disabled={!own.length} title={!own.length ? "This branch has no warehouse yet" : undefined}>Receive stock</Button>
    {choosing && <Drawer open onClose={() => setChoosing(false)} side="center" size="sm" title="Receive stock into">
      <ul className="space-y-2 p-4">{own.map((w) => <li key={w.id}><button type="button" onClick={() => { setChoosing(false); setTarget(w); }}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border px-3 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{w.branch_name ?? w.name}</span><span className="block truncate text-xs text-muted">{w.name}</span></span><ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      </button></li>)}</ul>
    </Drawer>}
    {target && <ReceiveStockDrawer warehouse={target} onClose={() => setTarget(null)} />}
  </>;
}

/** Opens a transfer already filled in: the product, from the branch that has it, to the branch that needs it. */
export function requestHref(productId: string, from: string, to: string, quantity: number) {
  return `/inventory/transfers?${new URLSearchParams({ create: "1", product: productId, from_branch: from, to_branch: to, qty: String(Math.max(1, Math.round(quantity))) })}`;
}
