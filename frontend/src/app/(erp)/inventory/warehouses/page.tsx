"use client";
import { useState } from "react";
import { Boxes, PackagePlus, Plus, Star, Warehouse as WarehouseIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Warehouse } from "@/lib/api";
import { useSetupWarehouses, useWarehouseAction, useWarehouses } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReceiveStockDrawer, WarehouseEditor } from "@/components/inventory/WarehouseDrawers";

const fail = (cause: unknown) => (cause as { detail?: string })?.detail ?? (cause as Error)?.message ?? "That didn't work. Please try again.";

export default function WarehousesPage() {
  const { hasPermission } = useAuth();
  const q = useWarehouses();
  const setup = useSetupWarehouses();
  const act = useWarehouseAction();
  const { confirm, dialog } = useConfirmDialog();
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  const [receiving, setReceiving] = useState<Warehouse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canManage = hasPermission("warehouses:create");
  const items = q.data?.items ?? [];

  const run = (id: string, action: "activate" | "deactivate" | "make-default") => { setProblem(null); act.mutate({ id, action }, { onError: (e) => setProblem(fail(e)) }); };

  return (
    <div className="space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="pesaa-page-title">Warehouses</h1><p className="text-sm text-muted">Where your stock is kept. Quantities here always add up to your stock on the Products page.</p></div>
        {canManage && q.data?.enabled && <Button onClick={() => setEditing("new")}><Plus size={15} aria-hidden /> New warehouse</Button>}
      </header>
      {problem && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">{problem}</p>}

      {q.isLoading || q.error ? <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.enabled ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-12 text-center">
          <WarehouseIcon size={28} className="text-muted" aria-hidden />
          <h2 className="text-base font-semibold">Warehouses are not switched on yet</h2>
          <p className="max-w-md text-sm text-muted">Switching them on creates a Main warehouse holding everything you have in stock now. Your sales, purchases and stock keep working exactly as they do today; from then on every movement is recorded by warehouse.</p>
          {canManage ? <Button disabled={setup.isPending} onClick={() => setup.mutate(undefined, { onError: (e) => setProblem(fail(e)) })}>{setup.isPending ? "Switching on…" : "Switch on warehouses"}</Button>
            : <p className="text-xs text-muted">Ask an owner or administrator to switch them on.</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <TableScroll mobileLayout="cards" label="Warehouses">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Warehouse</th><th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 font-medium">Manager</th><th className="px-4 py-2.5 text-right font-medium">Products</th><th className="px-4 py-2.5 text-right font-medium">Units on hand</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-border">{items.map((w) => (
                <tr key={w.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{w.name}{w.is_default && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"><Star size={10} aria-hidden /> Default</span>}<span className="block text-xs font-normal text-muted">{w.code}{w.address ? ` · ${w.address}` : ""}</span></td>
                  <td className="px-4 py-3">{w.branch_name ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3">{w.manager_name ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{w.products}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{w.units_on_hand.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${w.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{w.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1.5">
                    {canManage && w.is_active && <Button size="sm" variant="outline" onClick={() => setReceiving(w)}><PackagePlus size={13} aria-hidden /> Receive</Button>}
                    {canManage && <Button size="sm" variant="outline" onClick={() => setEditing(w)}>Edit</Button>}
                    {canManage && w.is_active && !w.is_default && <Button size="sm" variant="outline" onClick={() => run(w.id, "make-default")}>Make default</Button>}
                    {canManage && !w.is_default && <Button size="sm" variant="outline" onClick={() => w.is_active
                      ? confirm({ title: `Deactivate ${w.name}?`, message: "It stops receiving and giving out stock. This is only possible once it holds no stock and has no unfinished transfers or counts.", confirmLabel: "Deactivate", danger: true, onConfirm: () => run(w.id, "deactivate") })
                      : run(w.id, "activate")}>{w.is_active ? "Deactivate" : "Activate"}</Button>}
                  </div></td>
                </tr>))}</tbody>
            </table>
          </TableScroll>
          <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted"><Boxes size={13} aria-hidden /> Sales without a warehouse of their own are taken from the default. Move stock between warehouses with Transfers.</p>
        </div>
      )}
      {editing && <WarehouseEditor initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {receiving && <ReceiveStockDrawer warehouse={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
