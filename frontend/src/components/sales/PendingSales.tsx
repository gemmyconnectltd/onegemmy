"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/config";
import { fmtDateTime } from "@/lib/date";
import type { ApiOrder } from "@/lib/api";
import { useApproveOrder, useOrders, useRejectOrder } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SaleDocumentDrawer } from "@/components/sales/SaleDocumentDrawer";

/** Sales waiting for a decision before they are paid or leave stock: the approver sees what was sold, by whom, and decides. */
export function PendingSales() {
  const { currencySymbol } = useAppConfig();
  const { hasPermission } = useAuth();
  const q = useOrders(1, 25, "Awaiting Approval");
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const { confirm, dialog } = useConfirmDialog();
  const [rejecting, setRejecting] = useState<ApiOrder | null>(null);
  const [viewing, setViewing] = useState<ApiOrder | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const money = (n: number) => fmtMoney(n, currencySymbol);
  const orders = q.data?.items ?? [];
  if (!orders.length) return null;
  const may = (o: ApiOrder) => (o.held_reason === "policy" ? hasPermission("orders:approve") : hasPermission("credit:approve"));

  return (
    <section className="min-w-0 rounded-xl border border-amber-500/30 bg-card" aria-labelledby="pending-sales">
      {dialog}
      <header className="border-b border-border px-4 py-3"><h2 id="pending-sales" className="text-sm font-bold">Sales waiting for approval ({q.data?.total ?? orders.length})</h2>
        <p className="text-xs text-muted">Nothing is paid, taken from stock or booked for these until you approve them.</p></header>
      {problem && <p role="alert" className="px-4 pt-3 text-xs text-red-600">{problem}</p>}
      <TableScroll mobileLayout="cards" label="Sales waiting for approval">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Sale</th><th className="px-4 py-2 font-medium">Salesperson</th><th className="px-4 py-2 font-medium">Customer</th><th className="px-4 py-2 font-medium">Products</th><th className="px-4 py-2 text-right font-medium">Total</th><th className="px-4 py-2 font-medium">Why</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y divide-border">{orders.map((o) => (
            <tr key={o.id} className="align-top">
              <td className="px-4 py-3 font-semibold">{o.order_number}<span className="block text-xs font-normal text-muted">{fmtDateTime(o.ordered_at)}</span></td>
              <td className="px-4 py-3">{o.salesperson_name ?? "—"}</td>
              <td className="px-4 py-3">{o.customer?.name ?? <span className="text-muted">Walk-in</span>}</td>
              <td className="max-w-[260px] px-4 py-3 text-xs text-muted">{o.items.map((i) => `${i.product_name} × ${i.quantity}`).join(", ")}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(o.total)}</td>
              <td className="px-4 py-3 text-xs">{o.held_reason === "policy" ? "Every sale is approved first" : "Credit above the limit"}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1.5">
                <Button size="sm" variant="outline" aria-label={`Review ${o.order_number}`} onClick={() => setViewing(o)}><Eye size={13} aria-hidden /> Review</Button>
                {may(o) && <>
                  <Button size="sm" disabled={approve.isPending} onClick={() => confirm({ title: "Approve this sale?", message: `${o.order_number} will be completed: stock goes out and ${money(o.total)} is booked.`, confirmLabel: "Approve", onConfirm: () => approve.mutate({ id: o.id }, { onError: (e) => setProblem((e as { detail?: string })?.detail ?? e.message) }) })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(o)}>Reject</Button>
                </>}
              </div></td>
            </tr>))}</tbody>
        </table>
      </TableScroll>
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} danger title={`Reject ${rejecting?.order_number ?? "sale"}?`} message="The sale is declined and can never be paid. Nothing was booked, so no stock or accounts change. Your reason stays with the sale." confirmLabel="Reject sale"
        onConfirm={async (reason) => { if (rejecting) await reject.mutateAsync({ id: rejecting.id, note: reason }); }} />
      {viewing && <SaleDocumentDrawer order={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
