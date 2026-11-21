"use client";

import { TableScroll } from "@/components/ui/TableScroll";
import { dailyLabels, dailyMetrics, type DailyReport } from "@/lib/api/dailyReports";
import { formatMoney } from "@/lib/money";

/**
 * The owner's daily sheet: one line per branch (and per day when a range is shown) with stock value, sales, debt,
 * expense, deposit, Bank and MoMo, plus a totals line. On phones each branch becomes a labelled card.
 */
export function DailySheet({ data, showDate }: { data: DailyReport; showDate?: boolean }) {
  const money = (v: string | number) => formatMoney(Number(v), data.currency);
  const empty = (row: DailyReport["items"][number]) => dailyMetrics.every((m) => !Number(row[m]));
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <TableScroll label="Daily report by branch" mobileLayout="cards">
        <table className="w-full min-w-[900px] whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-border text-[12px] text-muted">
              {showDate && <th scope="col" className="px-4 py-2.5 text-left font-semibold">Date</th>}
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">Branch</th>
              {dailyMetrics.map((m) => <th key={m} scope="col" className="px-4 py-2.5 text-right font-semibold">{dailyLabels[m]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.map((row) => (
              <tr key={`${row.day}-${row.branch_id}`} className={empty(row) ? "text-muted" : undefined}>
                {showDate && <td className="px-4 py-3">{row.day}</td>}
                <td className="px-4 py-3 font-semibold text-foreground">{row.branch}</td>
                {dailyMetrics.map((m) => (
                  <td key={m} className={`px-4 py-3 text-right tabular-nums ${m === "sales" ? "font-semibold" : ""} ${m === "customer_credit" && Number(row[m]) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{money(row[m])}</td>
                ))}
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={dailyMetrics.length + (showDate ? 2 : 1)} className="px-4 py-8 text-center text-muted">Nothing was recorded for this day.</td></tr>}
          </tbody>
          {data.items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-surface/60 font-bold">
                <th scope="row" colSpan={showDate ? 2 : 1} className="px-4 py-3 text-left">Total</th>
                {dailyMetrics.map((m) => <td key={m} className="px-4 py-3 text-right tabular-nums">{money(data.totals[m])}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
    </div>
  );
}
