"use client";
import { useDeferredValue, useState } from "react";
import { Search } from "lucide-react";
import type { StockRow } from "@/lib/api";
import { useStockByWarehouse, useWarehouses } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";

const STATE: Record<StockRow["status"], { label: string; cls: string }> = {
  ok: { label: "In stock", cls: "bg-emerald-100 text-emerald-700" }, low: { label: "Low", cls: "bg-amber-100 text-amber-700" }, out: { label: "Out of stock", cls: "bg-red-100 text-red-700" },
};

export default function StockByWarehousePage() {
  const warehouses = useWarehouses();
  const [warehouse, setWarehouse] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useStockByWarehouse(page, { warehouse_id: warehouse || undefined, status: status || undefined, search: useDeferredValue(search) || undefined });
  const rows = q.data?.items ?? [];
  const filtered = !!(warehouse || status || search);
  const clear = () => { setWarehouse(""); setStatus(""); setSearch(""); setPage(1); };
  return (
    <div className="space-y-4">
      <header><h1 className="pesaa-page-title">Stock by warehouse</h1><p className="text-sm text-muted">What each warehouse holds right now. Choose one, or see the whole business.</p></header>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Search products" className="pl-8" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <Select aria-label="Warehouse" className="w-auto" value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(1); }}><option value="">All warehouses</option>{(warehouses.data?.items ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        <Select aria-label="Stock status" className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option value="ok">In stock</option><option value="low">Low</option><option value="out">Out of stock</option></Select>
      </div>
      {warehouses.data && !warehouses.data.enabled ? <TableState empty title="Warehouses are not switched on" hint="Switch them on under Warehouses to see stock by place." />
        : q.isLoading || q.error || rows.length === 0 ? <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={rows.length === 0} filtered={filtered} onClearFilters={clear} title="No stock found" hint="Nothing matches here yet." />
        : (
          <div className="rounded-xl border border-border bg-card">
            <TableScroll mobileLayout="cards" label="Stock by warehouse">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Product</th><th className="px-4 py-2.5 font-medium">Warehouse</th><th className="px-4 py-2.5 text-right font-medium">On hand</th><th className="px-4 py-2.5 text-right font-medium">Reserved</th><th className="px-4 py-2.5 text-right font-medium">Available</th><th className="px-4 py-2.5 font-medium">Unit</th><th className="px-4 py-2.5 font-medium">Last movement</th><th className="px-4 py-2.5 font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-border">{rows.map((r) => (
                  <tr key={`${r.warehouse_id}${r.product_id}${r.variant_id}`}>
                    <td className="px-4 py-3 font-medium">{r.name}{r.sku && <span className="block text-xs font-normal text-muted">{r.sku}</span>}</td>
                    <td className="px-4 py-3">{r.warehouse}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.on_hand.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{r.reserved.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.available.toLocaleString()}</td>
                    <td className="px-4 py-3">{r.unit ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{r.last_movement ? fmtDateTime(r.last_movement) : "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE[r.status].cls}`}>{STATE[r.status].label}</span></td>
                  </tr>))}</tbody>
              </table>
            </TableScroll>
            <Pagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} />
          </div>
        )}
    </div>
  );
}
