"use client";
import { useState } from "react";
import { useDailyBranchReport, useMyBranches } from "@/lib/api/hooks";
import { dailyMetrics, dailyReportsApi, type DailyFilters } from "@/lib/api/dailyReports";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { formatMoney } from "@/lib/money";

const labels = { sales: "Sales", customer_credit: "New credit", collections: "Collections / deposits", expenses: "Expenses", stock_in: "Purchased units", stock_out: "Sold units", production: "Produced units", materials_consumed: "Material units", wastage: "Wasted units" };
export default function DailyReportsPage() {
  const [filters, setFilters] = useState<DailyFilters>({});
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const report = useDailyBranchReport(filters, page);
  const branches = useMyBranches();
  const data = report.data;
  const metrics = data?.metrics ?? dailyMetrics.slice(0, 6);
  function change(next: DailyFilters) { setFilters(next); setPage(1); }
  async function download(format: "csv" | "pdf") {
    setError("");
    try { await dailyReportsApi.export(filters, format); }
    catch { setError("Could not export the report. Try again."); }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Daily branch activity</h1><p className="text-sm text-muted">Posted sales, collections, credit and expenses in your business currency.</p></div><div className="flex gap-2"><Button variant="outline" disabled={!data} onClick={() => void download("csv")}>CSV</Button><Button variant="outline" disabled={!data} onClick={() => void download("pdf")}>PDF</Button></div></div>
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
      <Field label="From date"><Input type="date" value={filters.from_date ?? ""} onChange={(e) => change({ ...filters, from_date: e.target.value || undefined })} /></Field>
      <Field label="To date"><Input type="date" value={filters.to_date ?? ""} onChange={(e) => change({ ...filters, to_date: e.target.value || undefined })} /></Field>
      <Field label="Branch"><Select value={filters.branch_id ?? ""} onChange={(e) => change({ ...filters, branch_id: e.target.value || undefined })}><option value="">Current selection / authorized branches</option>{branches.data?.items.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
    </div>
    {(error || report.error) && <p role="alert" className="text-sm text-red-600">{error || (report.error as Error).message || "Report unavailable. Check your permissions and branch access."}</p>}
    {report.isLoading ? <PageLoader variant="compact" /> : data && <>
      <p className="text-sm text-muted">{data.from_date} – {data.to_date} · {data.currency} · {data.timezone}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{dailyMetrics.slice(0, 4).map((key) => <div key={key} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted">{labels[key]}</p><p className="mt-1 text-lg font-semibold">{formatMoney(Number(data.totals[key]), data.currency)}</p></div>)}</div>
      <p className="text-sm"><strong>Current customer debt: {formatMoney(Number(data.outstanding_debt_now), data.currency)}</strong><span className="text-muted"> · Outstanding now across the selected branches; the date filter does not change this balance.</span></p>
      <div className="overflow-hidden rounded-xl border border-border bg-card"><TableScroll label="Daily branch activity"><table className="w-full min-w-[1000px] whitespace-nowrap"><thead><tr><th>Date</th><th>Branch</th>{metrics.map((key) => <th key={key}>{labels[key]}</th>)}</tr></thead><tbody>{data.items.map((row) => <tr key={`${row.day}-${row.branch_id}`}><td>{row.day}</td><td>{row.branch}</td>{metrics.map((key) => <td key={key}>{fmt(Number(row[key]))}</td>)}</tr>)}{!data.items.length && <tr><td colSpan={metrics.length + 2}>No posted activity for this period.</td></tr>}</tbody><tfoot><tr><th colSpan={2}>Period totals</th>{metrics.map((key) => <th key={key}>{fmt(Number(data.totals[key]))}</th>)}</tr></tfoot></table></TableScroll></div>
      <div className="flex items-center justify-between text-sm text-muted"><span>{data.total} records · Page {page}</span><div className="flex gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm text-muted">{Object.entries(data.definitions).map(([key, text]) => <p key={key}>{text}</p>)}</div>
    </>}
  </div>;
}
