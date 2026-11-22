"use client";

import Link from "next/link";
import { TableWrap } from "@/components/ui/Table";
import { dailyLabels, dailyMetrics, type DailyReport } from "@/lib/api/dailyReports";
import { formatMoney } from "@/lib/money";

/**
 * The owner's daily sheet: one line per branch (and per day when a range is shown) with stock value, sales, debt,
 * expense, deposit, Bank and MoMo, plus a totals line. Like every report table, all columns stay available in the
 * shared scrolling table boundary on phones.
 */
export function DailySheet({ data, showDate, stockNote }: { data: DailyReport; showDate?: boolean; stockNote?: string }) {
  const money = (v: string | number) => formatMoney(Number(v), data.currency);
  const empty = (row: DailyReport["items"][number]) => dailyMetrics.every((m) => !Number(row[m]));
  const columns = dailyMetrics.length + (showDate ? 2 : 1);
  return (
    <TableWrap>
      <table className="w-full min-w-[960px] whitespace-nowrap text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            {showDate && <th scope="col" className="font-semibold">Date</th>}
            <th scope="col" className="font-semibold">Branch</th>
            {dailyMetrics.map((m) => <th key={m} scope="col" className="text-right font-semibold" title={m === "stock_value" ? stockNote : undefined}>{dailyLabels[m]}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.items.map((row) => (
            <tr key={`${row.day}-${row.branch_id}`} className={empty(row) ? "text-muted" : undefined}>
              {showDate && <td>{row.day}</td>}
              <td className="font-semibold text-foreground">
                {row.branch_id
                  ? <Link href={`/reports/branches/${row.branch_id}?${new URLSearchParams({ from: data.from_date, to: data.to_date }).toString()}`} className="hover:text-accent hover:underline">{row.branch}</Link>
                  : row.branch}
              </td>
              {dailyMetrics.map((m) => (
                <td key={m} className={`text-right tabular-nums ${m === "sales" ? "font-semibold" : ""} ${m === "customer_credit" && Number(row[m]) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{money(row[m])}</td>
              ))}
            </tr>
          ))}
          {!data.items.length && <tr><td colSpan={columns} className="py-8 text-center text-muted">Nothing was recorded for this period.</td></tr>}
        </tbody>
        {data.items.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-surface/60 font-semibold">
              <th scope="row" colSpan={showDate ? 2 : 1} className="text-left">Total</th>
              {dailyMetrics.map((m) => <td key={m} className="text-right tabular-nums">{money(data.totals[m])}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </TableWrap>
  );
}
