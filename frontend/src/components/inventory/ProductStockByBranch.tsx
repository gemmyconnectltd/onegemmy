"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { StockPill } from "@/components/inventory/BranchStock";
import { useProductStockByBranch, useSetProductBranchStock } from "@/lib/api/hooks";
import type { ProductBranchStock } from "@/lib/api/branchStock";
import { fmtDate } from "@/lib/date";
import { useCan } from "@/lib/can";

/** One product in every branch the person may see (I3): its warehouse, on hand, the branch's own reorder level (editable where
 *  the person may change that branch), value and stock on the way. "Move between branches" opens a transfer for this product. */
export function ProductStockByBranch({ productId, fmt, unit }: { productId: string; fmt: (n: number) => string; unit?: string }) {
  const q = useProductStockByBranch(productId);
  const can = useCan();
  if (q.isLoading || q.error || !q.data) return <TableState loading={q.isLoading} error={q.error ?? undefined} onRetry={() => void q.refetch()} />;
  const data = q.data;
  if (!data.uses_warehouses) return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">This business keeps one stock figure for the whole business, so there is nothing to show per branch.</p>;
  return <section aria-labelledby="by-branch-title" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div><h2 id="by-branch-title" className="pesaa-card-title">Stock by branch</h2><p className="text-xs text-muted">{data.total_on_hand.toLocaleString()} {unit ?? "units"} across {data.items.length} {data.items.length === 1 ? "branch" : "branches"}. A branch with no level of its own uses the product&apos;s ({(data.default_reorder_level ?? 0).toLocaleString()}).</p></div>
      {can("stock", "create") && data.items.filter((r) => r.branch_id).length > 1 && <Link href={`/inventory/transfers?create=1&product=${productId}`}><Button variant="secondary">Move between branches</Button></Link>}
    </div>
    <TableScroll label="Stock by branch" mobileLayout="cards"><table className="min-w-[760px]">
      <thead><tr><th scope="col" className="text-left">Branch</th><th scope="col" className="text-right">On hand</th><th scope="col" className="text-right">Reorder level</th><th scope="col" className="text-right">Value at cost</th><th scope="col" className="text-right">On the way</th><th scope="col" className="text-left">Last movement</th></tr></thead>
      <tbody>{data.items.map((r) => <BranchRow key={r.branch_id ?? "shared"} row={r} productId={productId} fmt={fmt} />)}</tbody>
    </table></TableScroll>
  </section>;
}

function BranchRow({ row, productId, fmt }: { row: ProductBranchStock; productId: string; fmt: (n: number) => string }) {
  const save = useSetProductBranchStock();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const value = draft ?? String(row.reorder_level);
  const commit = async (data: { reorder_level?: number; use_product_reorder_level?: boolean }) => {
    setError("");
    try { await save.mutateAsync({ id: productId, branchId: row.branch_id!, data }); setDraft(null); }
    catch (e) { setError((e as { detail?: string })?.detail ?? (e instanceof Error ? e.message : "Couldn't save the level.")); }
  };
  const submit = () => {
    if (draft === null || Number(draft) === row.reorder_level) return setDraft(null);
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return setError("Enter 0 or more.");
    void commit({ reorder_level: n });
  };
  return <tr>
    <td data-label="Branch"><p className="font-semibold">{row.name}{!row.is_sold && <span className="ml-2 align-middle"><StockPill status="not_sold" /></span>}</p><p className="text-xs text-muted">{row.warehouses.map((w) => w.name).join(", ") || "No warehouse"}</p></td>
    <td data-label="On hand" className="text-right"><span className="inline-flex items-center gap-2"><StockPill status={row.status} /><span className="font-semibold tabular-nums">{row.on_hand.toLocaleString()}</span></span></td>
    <td data-label="Reorder level" className="text-right">
      {row.editable && row.branch_id ? <div className="inline-flex flex-col items-end gap-1">
        <Input aria-label={`Reorder level in ${row.name}`} inputMode="decimal" className="w-24 text-right" value={value} disabled={save.isPending}
          onChange={(e) => setDraft(e.target.value)} onBlur={submit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") setDraft(null); }} />
        {row.own_reorder_level ? <button type="button" className="text-xs text-accent hover:underline" onClick={() => void commit({ use_product_reorder_level: true })}>Use the product&apos;s</button> : <span className="text-xs text-muted">Product&apos;s level</span>}
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      </div> : <span className="tabular-nums text-muted">{row.reorder_level.toLocaleString()}</span>}
    </td>
    <td data-label="Value at cost" className="text-right tabular-nums">{fmt(row.value_cost)}</td>
    <td data-label="On the way" className="text-right tabular-nums">{row.in_transit ? row.in_transit.toLocaleString() : <span className="text-muted">—</span>}</td>
    <td data-label="Last movement" className="text-muted">{row.last_movement ? fmtDate(row.last_movement) : "Never"}</td>
  </tr>;
}
