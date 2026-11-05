"use client";
import { useState } from "react";
import { MOVEMENT_LABEL } from "@/lib/api";
import { useStockMovements, useWarehouses } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { ExportButton } from "@/components/ui/ExportButton";
import { Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { warehousesApi } from "@/lib/api";
import { fetchEvery } from "@/lib/exportTable";

export default function StockMovementsPage() {
  const warehouses = useWarehouses();
  const [warehouse, setWarehouse] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const f = { warehouse_id: warehouse || undefined, movement_type: type || undefined, from_date: from || undefined, to_date: to || undefined };
  const q = useStockMovements(page, f);
  const rows = q.data?.items ?? [];
  const filtered = !!(warehouse || type || from || to);
  const clear = () => { setWarehouse(""); setType(""); setFrom(""); setTo(""); setPage(1); };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="pesaa-page-title">Stock movements</h1><p className="text-sm text-muted">Every unit that came in or went out, with who did it and why. History is never edited: a mistake is fixed by a new movement.</p></div>
        <ExportButton build={async () => {
          const all = await fetchEvery((p, s) => warehousesApi.movements(p, f, s), 200);
          return { filename: "stock-movements", headers: ["Date", "Product", "Warehouse", "Type", "Quantity", "Reference", "By", "Note"], rows: all.map((m) => [m.created_at, m.product ?? "", m.warehouse ?? "", MOVEMENT_LABEL[m.movement_type] ?? m.movement_type, m.quantity, m.reference_number ?? "", m.user ?? "", m.note ?? ""]) };
        }} />
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Warehouse" className="w-auto" value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(1); }}><option value="">All warehouses</option>{(warehouses.data?.items ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        <Select aria-label="Movement type" className="w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All movements</option>{Object.entries(MOVEMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <label className="flex items-center gap-1.5 text-xs text-muted">From<Input type="date" className="w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="flex items-center gap-1.5 text-xs text-muted">To<Input type="date" className="w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
      </div>
      {q.isLoading || q.error || rows.length === 0 ? <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={rows.length === 0} filtered={filtered} onClearFilters={clear} title="No movements yet" hint="Movements are recorded once warehouses are switched on." />
        : (
          <div className="rounded-xl border border-border bg-card">
            <TableScroll mobileLayout="cards" label="Stock movements">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium">Product</th><th className="px-4 py-2.5 font-medium">Warehouse</th><th className="px-4 py-2.5 font-medium">Type</th><th className="px-4 py-2.5 text-right font-medium">Quantity</th><th className="px-4 py-2.5 font-medium">Reference</th><th className="px-4 py-2.5 font-medium">By</th></tr></thead>
                <tbody className="divide-y divide-border">{rows.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{fmtDateTime(m.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{m.product ?? "—"}{m.note && <span className="block text-xs font-normal text-muted">{m.note}</span>}</td>
                    <td className="px-4 py-3">{m.warehouse ?? "—"}</td>
                    <td className="px-4 py-3">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${m.direction === "in" ? "text-emerald-700" : "text-red-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3">{m.reference_number ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">{m.user ?? <span className="text-muted">—</span>}</td>
                  </tr>))}</tbody>
              </table>
            </TableScroll>
            <Pagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} />
          </div>
        )}
    </div>
  );
}
