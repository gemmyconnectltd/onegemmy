import { downloadFile, qs, request } from "./client";
import type { SingleResponse } from "./types";
export const dailyMetrics = ["sales", "customer_credit", "collections", "expenses", "stock_in", "stock_out", "production", "materials_consumed", "wastage"] as const;
export type DailyMetric = typeof dailyMetrics[number];
export interface DailyReport {
  outstanding_debt_now: string;
  metrics: DailyMetric[];
  currency: string; timezone: string; from_date: string; to_date: string;
  items: ({ day: string; branch: string; branch_id: string | null } & Record<DailyMetric, string>)[];
  totals: Record<DailyMetric, string>; definitions: Record<string, string>; total: number;
}
export interface DailyFilters { from_date?: string; to_date?: string; branch_id?: string; }
export const dailyReportsApi = {
  get: (filters: DailyFilters, page: number) => request<SingleResponse<DailyReport>>(`/tenants/reports/daily-branches${qs({ ...filters, page, page_size: 25 })}`),
  export: (filters: DailyFilters, format: "csv" | "pdf") => downloadFile(`/tenants/reports/daily-branches/export${qs({ ...filters, format })}`, `daily-branches.${format}`),
};
