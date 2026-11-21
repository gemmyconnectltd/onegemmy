"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DailySheet } from "@/components/reports/DailySheet";
import { ReportExport } from "@/components/reports/ReportExport";
import { Kpi } from "@/components/reports/parts";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useDailyBranchReport, useMyBranches } from "@/lib/api/hooks";
import { dailyLabels, dailyMetrics, dailyReportsApi, type DailyFilters } from "@/lib/api/dailyReports";
import { formatMoney } from "@/lib/money";
import { toISODate } from "@/lib/period";

const shift = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return toISODate(d); };
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** The owner's daily report: per branch, the day's stock value, sales, debt, expense, deposit, Bank and MoMo. */
export default function DailyReportsPage() {
  const today = toISODate(new Date());
  const [day, setDay] = useState(today);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [branch, setBranch] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const filters: DailyFilters = { from_date: range?.from ?? day, to_date: range?.to ?? day, branch_id: branch };
  const report = useDailyBranchReport(filters, page);
  const branches = useMyBranches();
  const data = report.data;


  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="pesaa-page-title text-foreground">Daily report</h1><p className="mt-0.5 text-sm text-muted">Each branch&apos;s day: stock value, sales, debt, expense, deposit, Bank and MoMo.</p></div>
      <ReportExport onExport={(format) => dailyReportsApi.export(filters, format)} />
    </div>

    <div className="flex flex-wrap items-end gap-3">
      {range ? <>
        <Field label="From"><Input type="date" max={range.to} value={range.from} onChange={(e) => { setRange({ ...range, from: e.target.value || range.from }); setPage(1); }} /></Field>
        <Field label="To"><Input type="date" min={range.from} max={today} value={range.to} onChange={(e) => { setRange({ ...range, to: e.target.value || range.to }); setPage(1); }} /></Field>
        <Button variant="ghost" onClick={() => { setRange(null); setPage(1); }}>One day</Button>
      </> : <>
        <div className="flex items-center rounded-lg border border-border bg-card" role="group" aria-label="Day">
          <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDay(shift(day, -1))}><ChevronLeft size={16} /></Button>
          <label className="px-1"><span className="sr-only">Day</span><input type="date" max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-10 bg-transparent px-2 text-sm font-semibold text-foreground outline-none" /></label>
          <Button variant="ghost" size="icon" aria-label="Next day" disabled={day >= today} onClick={() => setDay(shift(day, 1))}><ChevronRight size={16} /></Button>
        </div>
        {day !== today && <Button variant="ghost" onClick={() => setDay(today)}>Today</Button>}
        <Button variant="ghost" onClick={() => { setRange({ from: shift(day, -6), to: day }); setPage(1); }}>Several days</Button>
      </>}
      {(branches.data?.items.length ?? 0) > 1 && (
        <Select aria-label="Branch" className="w-auto" value={branch ?? ""} onChange={(e) => { setBranch(e.target.value || undefined); setPage(1); }}>
          <option value="">All branches</option>{branches.data?.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      )}
    </div>

    {report.error && <p role="alert" className="text-sm text-red-600">{(report.error as Error).message || "Report unavailable. Check your permissions and branch access."}</p>}
    {report.isLoading ? <PageLoader variant="compact" /> : data && <>
      <p className="text-sm text-muted">{range ? `${longDate(data.from_date)} to ${longDate(data.to_date)}` : longDate(data.from_date)} · amounts in {data.currency}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {dailyMetrics.map((m) => <Kpi key={m} label={dailyLabels[m]} value={formatMoney(Number(data.totals[m]), data.currency)} note={m === "stock_value" ? (range ? "At the end of the last day" : "At the end of the day") : undefined} />)}
      </div>
      <DailySheet data={data} showDate={!!range} />
      {data.total > 25 && <div className="flex items-center justify-between text-sm text-muted"><span>{data.total} lines · page {page}</span><div className="flex gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
      <p className="text-sm"><strong>Customers owe you now: {formatMoney(Number(data.outstanding_debt_now), data.currency)}</strong><span className="text-muted"> · all unpaid sales today, whatever the date above.</span></p>
      <details className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]"><summary className="cursor-pointer font-semibold text-foreground">How these numbers are calculated</summary><ul className="mt-2 space-y-1 text-muted">{Object.values(data.definitions).map((t) => <li key={t}>{t}</li>)}</ul></details>
    </>}
  </div>;
}
