"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { DailySheet } from "@/components/reports/DailySheet";
import { ReportExport } from "@/components/reports/ReportExport";
import { Kpi } from "@/components/reports/parts";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { dailyLabels, dailyMetrics, dailyReportsApi } from "@/lib/api/dailyReports";
import { useDailyBranchReport, useMyBranch } from "@/lib/api/hooks";
import { formatMoney } from "@/lib/money";
import { dateRangeLabel, periodFromQuery, periodRange, toISODate } from "@/lib/period";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function ReportBranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const query = search.toString();
  const branch = useMyBranch(id);
  const range = useMemo(() => {
    const parsed = periodFromQuery(query);
    if (parsed?.from && parsed.to) return { from: parsed.from, to: parsed.to };
    const fallback = periodRange({ key: "month" });
    return { from: fallback.from ?? toISODate(new Date()), to: fallback.to ?? toISODate(new Date()) };
  }, [query]);
  const filters = { from_date: range.from, to_date: range.to, branch_id: id };
  const report = useDailyBranchReport(filters, 1);
  const today = toISODate(new Date());
  const back = `/reports?period=custom&from=${range.from}&to=${range.to}&compare=none`;

  const setDate = (key: "from" | "to", value: string) => {
    if (!DATE.test(value)) return;
    const next = key === "from" ? { from: value, to: range.to } : { from: range.from, to: value };
    if (next.from > next.to) return;
    const params = new URLSearchParams(query);
    params.set("from", next.from);
    params.set("to", next.to);
    router.replace(`/reports/branches/${encodeURIComponent(id)}?${params.toString()}`, { scroll: false });
  };

  if (branch.isLoading) return <PageLoader variant="compact" />;
  if (branch.isError || !branch.data) {
    const denied = (branch.error as { status?: number } | null)?.status === 403;
    return (
      <div className="py-16 text-center">
        <Building2 className="mx-auto mb-3 text-muted" size={28} aria-hidden />
        <h1 className="pesaa-page-title text-foreground">{denied ? "You don't have access to this branch" : "Branch not found"}</h1>
        <p className="mt-1 text-sm text-muted">{denied ? "Ask an administrator to add it to your branches." : "It may have been deleted, or it belongs to another business."}</p>
        <Link href="/reports" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">← Business reports</Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Link href={back} className="mb-2 inline-block text-[12px] font-semibold text-muted hover:text-foreground">← Business reports</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="pesaa-page-title text-foreground">{branch.data.name} report</h1>
            <p className="mt-0.5 text-sm text-muted">{dateRangeLabel(range.from, range.to)} · {branch.data.location || "No location set"}</p>
          </div>
          <ReportExport onExport={(format) => dailyReportsApi.export(filters, format)} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" max={range.to} value={range.from} onChange={(e) => setDate("from", e.target.value)} /></Field>
        <Field label="To"><Input type="date" min={range.from} max={today} value={range.to} onChange={(e) => setDate("to", e.target.value)} /></Field>
      </div>

      {report.error && <p role="alert" className="text-sm text-red-600">{(report.error as Error).message || "Report unavailable. Check your permissions and branch access."}</p>}
      {report.isLoading ? <PageLoader variant="compact" /> : report.data && (
        <>
          <p className="text-sm text-muted">{dateRangeLabel(report.data.from_date, report.data.to_date)} · amounts in {report.data.currency}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            {dailyMetrics.map((m) => <Kpi key={m} label={dailyLabels[m]} value={formatMoney(Number(report.data!.totals[m]), report.data!.currency)} />)}
          </div>
          <DailySheet data={report.data} showDate={range.from !== range.to} stockNote={range.from === range.to ? "At the end of the day" : "At the end of the period"} />
          <details className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]"><summary className="cursor-pointer font-semibold text-foreground">How these numbers are calculated</summary><ul className="mt-2 space-y-1 text-muted">{Object.values(report.data.definitions).map((text) => <li key={text}>{text}</li>)}</ul></details>
        </>
      )}
    </div>
  );
}
