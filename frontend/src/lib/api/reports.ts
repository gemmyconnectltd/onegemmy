import { request, qs } from "./client";
import type { SingleResponse } from "./types";

export type CompareMode = "none" | "previous" | "year" | "custom";

export interface PerformanceMetrics {
  sales: number; net_sales: number; tax: number; discount: number; orders: number; average_order: number | null;
  cost_of_goods: number | null; items_missing_cost: number; gross_profit: number | null; gross_margin: number | null;
  expenses: number | null; returns: number; net_profit: number | null;
}
export interface MetricChange { change: number; percent: number | null }
export interface SeriesPoint { date: string; sales: number; orders: number; expenses: number | null; profit: number | null }
export interface Insight { tone: "positive" | "negative" | "neutral"; text: string; href?: string }
export interface PerformanceReport {
  from_date: string; to_date: string; days: number; grain: "day" | "week" | "month" | "year"; currency: string; timezone: string; branch_id: string | null;
  definitions: Record<string, string>;
  current: PerformanceMetrics;
  comparison: { mode: CompareMode; from_date: string; to_date: string; label: string; has_data: boolean; metrics: PerformanceMetrics | null; changes: Record<string, MetricChange> } | null;
  series: SeriesPoint[]; insights: Insight[];
  top_products: { name: string; revenue: number; quantity: number }[];
  by_branch: { id: string | null; name: string; sales: number; orders: number }[];
  by_payment: { method: string; sales: number; orders: number }[];
  receivables: number | null;
  stock: { low_stock: number; out_of_stock: number; valuation: number; products: number } | null;
  can_see_expenses: boolean;
}
export interface PerformanceQuery { from?: string; to?: string; branch?: string; compare: CompareMode; compareFrom?: string; compareTo?: string }

export interface BreakdownRow { name: string; sales: number; orders: number; quantity: number; cost: number | null; gross_profit: number | null; margin: number | null }
export type SalesDimension = "product" | "category" | "customer" | "branch" | "employee" | "payment";
export interface SalesBreakdown { from_date: string; to_date: string; currency: string; dimension: SalesDimension; rows: BreakdownRow[]; totals: PerformanceMetrics; note: string }
export interface OperationsReport {
  from_date: string; to_date: string; currency: string;
  inventory: null | { low_stock: number; out_of_stock: number; valuation: number; products: number; low: { name: string; stock: number; min_stock: number }[]; fast_moving: { name: string; sold: number; stock: number }[]; slow_moving: { name: string; stock: number; value: number }[]; note: string };
  purchases: null | { total: number; orders: number; by_status: { status: string; orders: number; amount: number }[]; top_suppliers: { name: string; amount: number; orders: number }[] };
  customers: null | { new_customers: number; buying_customers: number; returning: number; orders_per_customer: number | null; top: { name: string; orders: number; sales: number }[]; receivables: number | null };
}
export interface FinancialReport {
  from_date: string; to_date: string; currency: string; expenses_total: number; pending_expenses: number;
  by_category: { name: string; amount: number; count: number; share: number }[]; by_branch: { name: string; amount: number }[];
  largest: { title: string; category: string; date: string; amount: number }[]; receivables: number | null; metrics: PerformanceMetrics;
}
interface Scope { from?: string; to?: string; branch?: string }
const scope = (q: Scope) => ({ from_date: q.from, to_date: q.to, branch_id: q.branch });

export const reportsApi = {
  salesBreakdown: (q: Scope, dimension: SalesDimension) => request<SingleResponse<SalesBreakdown>>(`/tenants/reports/sales-breakdown${qs({ ...scope(q), dimension })}`),
  operations: (q: Scope) => request<SingleResponse<OperationsReport>>(`/tenants/reports/operations${qs(scope(q))}`),
  financial: (q: Scope) => request<SingleResponse<FinancialReport>>(`/tenants/reports/financial${qs(scope(q))}`),
  performance: (q: PerformanceQuery) =>
    request<SingleResponse<PerformanceReport>>(`/tenants/reports/performance${qs({ from_date: q.from, to_date: q.to, branch_id: q.branch, compare: q.compare, compare_from: q.compareFrom, compare_to: q.compareTo })}`),
};
