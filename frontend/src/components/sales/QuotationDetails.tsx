"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Download, Pencil, Send, Share2, ShoppingCart, X } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/config";
import { salesApi, type ApiQuotation, type QuotationStatus } from "@/lib/api";
import { saveFile } from "@/lib/api/client";
import { useQuotation, useQuotationAction, useQuotationActivity, useRejectQuotation } from "@/lib/api/hooks";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { FormErrorSummary } from "@/components/ui/FormKit";

export const QUOTATION_STYLE: Record<QuotationStatus, string> = {
  Draft: "bg-slate-100 text-slate-700", Sent: "bg-blue-100 text-blue-700", Accepted: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700", Expired: "bg-amber-100 text-amber-700",
};
export const QuotationBadge = ({ status }: { status: QuotationStatus }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${QUOTATION_STYLE[status]}`}>{status}</span>;

const fail = (cause: unknown) => (cause as { detail?: string })?.detail ?? (cause as Error)?.message ?? "That didn't work. Please try again.";

export function QuotationDetails({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (q: ApiQuotation) => void }) {
  const { currencySymbol } = useAppConfig();
  const { hasPermission } = useAuth();
  const { data: q } = useQuotation(id);
  const { data: activity } = useQuotationActivity(id);
  const act = useQuotationAction();
  const reject = useRejectQuotation();
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "share" | null>(null);
  const canEdit = hasPermission("orders:update");
  const money = (n: number) => fmtMoney(n, currencySymbol);

  const run = async (action: "send" | "accept" | "convert") => { setError(null); try { await act.mutateAsync({ id, action }); } catch (cause) { setError(fail(cause)); } };
  async function pdf(share: boolean) {
    if (!q) return;
    setError(null); setBusy(share ? "share" : "pdf");
    try {
      const { blob, filename } = await salesApi.quotationFile(q.id, q.quote_number);
      const file = new File([blob], filename, { type: "application/pdf" });
      if (share && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `Quotation ${q.quote_number}` });
      else saveFile(blob, filename);
    } catch (cause) { if ((cause as Error)?.name !== "AbortError") setError(fail(cause)); } finally { setBusy(null); }
  }

  return (
    <Drawer open onClose={onClose} size="xl" title={q ? `Quotation ${q.quote_number}` : "Quotation"} description={q ? `${q.customer?.name ?? "Walk-in customer"} · ${q.salesperson_name ?? "No salesperson"}` : undefined}>
      {!q ? <p className="p-5 text-sm text-muted" role="status">Loading…</p> : (
        <div className="space-y-4 p-4 sm:p-5">
          <FormErrorSummary errors={error} />
          <div className="flex flex-wrap items-center gap-2">
            <QuotationBadge status={q.status} />
            {q.expiry_date && <span className="text-xs text-muted">Valid until {q.expiry_date}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void pdf(false)}><Download size={14} aria-hidden /> PDF</Button>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void pdf(true)}><Share2 size={14} aria-hidden /> Share</Button>
              {q.status === "Draft" && canEdit && <Button variant="outline" size="sm" onClick={() => onEdit(q)}><Pencil size={14} aria-hidden /> Edit</Button>}
              {q.status === "Draft" && canEdit && <Button size="sm" disabled={act.isPending} onClick={() => void run("send")}><Send size={14} aria-hidden /> Mark as sent</Button>}
              {q.status === "Sent" && canEdit && <><Button size="sm" disabled={act.isPending} onClick={() => void run("accept")}><Check size={14} aria-hidden /> Customer accepted</Button><Button variant="outline" size="sm" onClick={() => setRejecting(true)}><X size={14} aria-hidden /> Declined</Button></>}
              {q.status === "Accepted" && !q.converted_order_id && canEdit && <Button size="sm" disabled={act.isPending} onClick={() => void run("convert")}><ShoppingCart size={14} aria-hidden /> Convert to sale</Button>}
            </div>
          </div>

          {q.converted_order_id && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">Converted to sale <Link className="font-semibold text-accent hover:underline" href="/sales/orders">{q.converted_order_number ?? "open sales"}</Link>. It is a pending sale: nothing is paid or taken from stock until it is completed.</p>}
          {q.decision_reason && <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm"><span className="text-muted">Reason given: </span>{q.decision_reason}</p>}

          <section className="min-w-0 rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">{q.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0"><p className="font-medium">{i.product_name}</p><p className="text-xs text-muted">{i.quantity} × {money(i.unit_price)}{i.sku ? ` · ${i.sku}` : ""}{i.discount > 0 ? ` · discount ${money(i.discount)}` : ""}</p></div>
                <p className="shrink-0 font-semibold tabular-nums">{money(i.line_total)}</p>
              </li>))}</ul>
            <dl className="ml-auto w-full max-w-xs space-y-1 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(q.subtotal)}</dd></div>
              {q.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular-nums">−{money(q.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">VAT included</dt><dd className="tabular-nums">{money(q.tax)}</dd></div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(q.total)}</dd></div>
            </dl>
          </section>

          {(q.notes || q.terms) && <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">{q.notes && <p><span className="text-muted">Remarks: </span>{q.notes}</p>}{q.terms && <p className="whitespace-pre-line text-muted">{q.terms}</p>}</section>}

          <section className="rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title mb-2">Activity</h2>
            <ol className="space-y-2 text-sm">{(activity ?? []).map((a, n) => <li key={n} className="flex flex-wrap justify-between gap-2"><span>{a.summary}{a.by && <span className="text-muted"> · {a.by}</span>}</span><time className="text-xs text-muted">{a.at ? new Date(a.at).toLocaleString() : ""}</time></li>)}</ol>
          </section>
        </div>
      )}
      <ReasonDialog open={rejecting} title="Customer declined this quotation" message="Say why, so the team learns from it. A declined quotation cannot be converted." confirmLabel="Mark as declined" danger onClose={() => setRejecting(false)}
        onConfirm={async (reason) => { await reject.mutateAsync({ id, reason }); }} />
    </Drawer>
  );
}
