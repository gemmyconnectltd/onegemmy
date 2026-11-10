"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVatReport } from "@/lib/api/hooks";
import { VAT_LABELS } from "@/lib/api/sales";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { ExportButton } from "@/components/ui/ExportButton";
import { FinancialError, SummaryCards, useFinancialMoney } from "./FinancialShared";

const label = (kind: string) => kind === "unclassified" ? "Recorded without VAT" : VAT_LABELS[kind as keyof typeof VAT_LABELS] ?? kind;
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"); };
const today = () => new Date().toLocaleDateString("en-CA");

/** VAT position for a period: sales by treatment (zero-rated, exempt and out of scope kept apart), returns, input VAT,
 *  the net position, and whether it agrees with the ledger. Built from each document's recorded VAT. */
export function VatReport() {
  const { activeBranchId } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const q = useVatReport(from, to, activeBranchId);
  const fmt = useFinancialMoney();
  const r = q.data;
  const reconciled = r && Math.abs(Number(r.ledger.difference)) < 0.005;
  const rows = r ? Object.entries(r.sales) : [];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {r && <ExportButton label="Export VAT report" build={async () => ({
        filename: `vat-report-${r.period.from}-to-${r.period.to}`,
        headers: ["Line", "Taxable amount", "VAT", "Documents"],
        rows: [
          ...rows.map(([kind, v]) => [`Sales: ${label(kind)}`, Number(v.base), Number(v.tax), v.documents]),
          ...Object.entries(r.returns).map(([kind, v]) => [`Returns: ${label(kind)}`, -Number(v.gross), -Number(v.tax), null]),
          ["Input VAT recoverable", null, -Number(r.input_vat.recoverable), null],
          ["Input VAT non-recoverable (in cost)", null, Number(r.input_vat.non_recoverable), null],
          ["Input VAT reversed by purchase returns", null, Number(r.input_vat.purchase_returns), null],
          ["Net VAT position", null, Number(r.net_vat), null],
        ],
      })} />}
    </div>
    <FinancialError error={q.error} />
    {q.isFetching && !r ? <PageLoader variant="compact" /> : r && <>
      <SummaryCards values={{ "Output VAT": r.output_vat, "VAT on returns": r.returns_vat, "Input VAT recoverable": r.input_vat.recoverable, "Net VAT position": r.net_vat }} />
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <TableScroll><table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-background text-muted"><tr><th className="px-4 py-3">Sales by VAT treatment</th><th className="px-4 py-3 text-right">Taxable amount</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-right">Sales</th></tr></thead>
          <tbody>
            {rows.map(([kind, v]) => <tr key={kind} className="border-t border-border"><td className="px-4 py-3 font-medium">{label(kind)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(v.base)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(v.tax)}</td><td className="px-4 py-3 text-right tabular-nums">{v.documents}</td></tr>)}
            {Object.entries(r.returns).map(([kind, v]) => <tr key={`ret-${kind}`} className="border-t border-border text-muted"><td className="px-4 py-3">Returns: {label(kind)}</td><td className="px-4 py-3 text-right tabular-nums">−{fmt(v.gross)}</td><td className="px-4 py-3 text-right tabular-nums">−{fmt(v.tax)}</td><td /></tr>)}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No sales in this period.</td></tr>}
            <tr className="border-t border-border"><td className="px-4 py-3">Input VAT not recoverable (kept in cost)</td><td /><td className="px-4 py-3 text-right tabular-nums">{fmt(r.input_vat.non_recoverable)}</td><td /></tr>
            <tr className="border-t border-border"><td className="px-4 py-3">Input VAT reversed by purchase returns</td><td /><td className="px-4 py-3 text-right tabular-nums">{fmt(r.input_vat.purchase_returns)}</td><td /></tr>
          </tbody>
        </table></TableScroll>
      </section>
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${reconciled ? "border-accent/20 bg-accent/5 text-accent" : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"}`}>
        {reconciled ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
        <strong>{reconciled ? "Agrees with the ledger" : "Review against the ledger"}</strong>
        <span>VAT Payable moved {fmt(r.ledger.vat_payable_movement)}; Input VAT Recoverable moved {fmt(r.ledger.input_vat_movement)}.</span>
        {!reconciled && <span>Difference: {fmt(r.ledger.difference)} (manual journals or postings dated outside their documents).</span>}
      </div>
      <p className="text-xs text-muted">Figures are in the business currency and come from the VAT recorded on each sale, return and purchase. Sales from before line-level VAT are shown from their order totals. This report is not a filed return; PESAA is not connected to EBM/EIS.</p>
    </>}
  </div>;
}
