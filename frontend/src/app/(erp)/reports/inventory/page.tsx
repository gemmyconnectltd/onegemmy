"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "@/components/charts/lazy";
import { Package, AlertTriangle, TrendingDown, Layers, Boxes, Loader2, Download, FileText } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { inventoryApi } from "@/lib/api";
import { useValuationReport } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import type { ValuationLine } from "@/lib/api/inventory";

const ACCENT = "#059669";
const ACCENT_DARK = "#34d399";

const STATUS_STYLE: Record<ValuationLine["status"], string> = {
  out: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  low: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};
const STATUS_LABEL: Record<ValuationLine["status"], string> = {
  out: "Out of stock",
  low: "Low stock",
  ok: "In stock",
};

export default function InventoryReportPage() {
  const { theme } = useAppConfig();
  const accent = theme === "dark" ? ACCENT_DARK : ACCENT;
  const { data: report, isLoading } = useValuationReport();
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const download = async (format: "csv" | "pdf") => {
    setExporting(format);
    try { await inventoryApi.exportValuationReport(format); }
    catch { /* ignore */ }
    finally { setExporting(null); }
  };

  if (isLoading) return <PageLoader />;
  if (!report) return <p className="text-sm text-muted py-10 text-center">Could not load valuation report.</p>;

  const { summary, categories, lines } = report;
  const filtered = lines.filter((l) => (filter === "all" ? true : l.status === filter));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-foreground tracking-tight">Inventory Report</h1>
            <p className="text-sm text-muted mt-0.5">
              {summary.product_count} products, {summary.line_count} tracked lines ({summary.variant_count} variants) ·{" "}
              {summary.total_units.toLocaleString()} units on hand
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => download("csv")}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              {exporting === "csv" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Export CSV
            </button>
            <button
              onClick={() => download("pdf")}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: accent }}
            >
              {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Tracked Lines", value: summary.line_count.toString(), icon: Package, color: accent },
          { label: "Total Units", value: summary.total_units.toLocaleString(), icon: Boxes, color: theme === "dark" ? "#c084fc" : "#9333ea" },
          { label: "Stock Value (Cost)", value: fmtMoney(summary.cost_value), icon: TrendingDown, color: theme === "dark" ? "#818cf8" : "#6366f1" },
          { label: "Retail Value", value: fmtMoney(summary.retail_value), icon: Layers, color: theme === "dark" ? "#38bdf8" : "#0284c7" },
          { label: "Low / Out of Stock", value: `${summary.low_stock_count} / ${summary.out_of_stock_count}`, icon: AlertTriangle, color: theme === "dark" ? "#f87171" : "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-muted">
          Valuation = on-hand qty × unit cost. Costing method: <span className="font-semibold text-foreground">{report.costing_method}</span>.
          Per-lot FIFO layers are not tracked yet — add purchase lot costing to value stock at FIFO cost.
        </p>
        <span className="text-[11px] text-muted font-mono">{new Date(report.generated_at).toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Stock Value by Category</h2>
          {categories.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip formatter={(v) => [fmtMoney(Number(v)), "Value"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }} />
                  <Bar dataKey="cost_value" fill={accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted py-10 text-center">No inventory yet</p>}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Low / Out of Stock</h2>
          {summary.out_of_stock_count + summary.low_stock_count > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {lines.filter((l) => l.status !== "ok").map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{l.name}</p>
                    <p className="text-[11px] text-muted font-mono">{l.sku ?? "No SKU"}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]}`}>
                    {l.status === "out" ? "Out of stock" : `${l.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted py-10 text-center">All products are well stocked</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">Inventory Valuation</h2>
          <div className="flex gap-1 bg-muted/40 rounded-lg p-0.5">
            {([["all", "All"], ["low", "Low"], ["out", "Out"] ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filter === key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border text-left">
                {["Item", "Category", "Qty", "Unit Cost", "Stock Value", "Retail Value", "Margin", "Status"].map((h) => (
                  <th key={h} className="pb-3 pr-3 text-[11px] font-semibold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-foreground">{l.name}</p>
                    <p className="text-[11px] text-muted font-mono">{l.sku ?? "—"}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-muted">{l.category ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-foreground">{l.stock}</td>
                  <td className="py-2.5 pr-3 text-muted">{fmtMoney(l.cost)}</td>
                  <td className="py-2.5 pr-3 font-semibold text-foreground">{fmtMoney(l.cost_value)}</td>
                  <td className="py-2.5 pr-3 text-emerald-600 dark:text-emerald-400 font-semibold">{fmtMoney(l.retail_value)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="text-foreground font-semibold">{fmtMoney(l.margin)}</span>
                    {l.margin_pct != null && <span className="text-muted text-xs ml-1">({l.margin_pct}%)</span>}
                  </td>
                  <td className="py-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted">No items in this filter</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={2} className="py-3 text-sm font-bold text-foreground">Total</td>
                  <td className="py-3 font-bold text-foreground">{filtered.reduce((s, l) => s + l.stock, 0).toLocaleString()}</td>
                  <td className="py-3 text-muted">—</td>
                  <td className="py-3 font-bold text-foreground">{fmtMoney(filtered.reduce((s, l) => s + l.cost_value, 0))}</td>
                  <td className="py-3 font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(filtered.reduce((s, l) => s + l.retail_value, 0))}</td>
                  <td className="py-3 font-bold text-foreground">{fmtMoney(filtered.reduce((s, l) => s + l.margin, 0))}</td>
                  <td className="py-3">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
