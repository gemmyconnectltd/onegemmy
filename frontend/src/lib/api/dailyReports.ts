import { downloadFile, qs, request } from "./client";
import type { SingleResponse } from "./types";
/** The owner's daily sheet, in the order the business reads it. */
export const dailyMetrics = ["stock_value", "sales", "customer_credit", "expenses", "deposits", "bank", "momo"] as const;
export const dailyLabels: Record<DailyMetric, string> = { stock_value: "Stock value", sales: "Sales", customer_credit: "Debt", expenses: "Expense", deposits: "Deposit", bank: "Bank", momo: "MoMo" };
export type DailyMetric = typeof dailyMetrics[number];
export interface DailyReport {
  outstanding_debt_now: string;
  metrics: DailyMetric[];
  currency: string; timezone: string; from_date: string; to_date: string;
  items: ({ day: string; branch: string; branch_id: string | null } & Record<DailyMetric, string>)[];
  totals: Record<DailyMetric, string>; definitions: Record<string, string>; total: number;
}
/** by: "branch" gives one line per branch for the whole period instead of one per branch and day. */
export interface DailyFilters { from_date?: string; to_date?: string; branch_id?: string; by?: "day" | "branch" }

export const dailyReportsApi = {
  get: (filters: DailyFilters, page: number) => request<SingleResponse<DailyReport>>(`/tenants/reports/daily-branches${qs({ ...filters, page, page_size: 25 })}`),
  export: (filters: DailyFilters, format: "csv" | "pdf" | "xlsx") => downloadFile(`/tenants/reports/daily-branches/export${qs({ ...filters, format })}`, `daily-report.${format}`),
};
