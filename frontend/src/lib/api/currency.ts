import { request, qs } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

export interface ExchangeRate {
  id: string;
  /** null = a platform-wide rate (managed by PESAA), otherwise this business's own. */
  tenant_id: string | null;
  /** 1 `base_currency` = `rate` `quote_currency`. */
  base_currency: string;
  quote_currency: string;
  rate: number;
  effective_at: string;
  source: string;
  created_by: string | null;
  created_at: string | null;
}

export interface ExchangeRateInput {
  base_currency: string;
  quote_currency: string;
  rate: number;
  /** ISO datetime; omit for "now". */
  effective_at?: string;
}

export interface TenantCurrencySettings {
  base_currency: string;
  /** false once the business has recorded any transaction. */
  can_change: boolean;
  locked_reason: string | null;
}

export interface ResolvedRate {
  from: string;
  to: string;
  rate: number;
  source: "identity" | "tenant" | "platform";
}

export interface PlatformCurrencySettings {
  reporting_currency: string;
}

export const currencyApi = {
  // Tenant-scoped: always the caller's own business.
  settings: () => request<SingleResponse<TenantCurrencySettings>>("/currency/settings"),
  listRates: (page = 1, pageSize = 20) =>
    request<PaginatedResponse<ExchangeRate>>(`/currency/exchange-rates${qs({ page, page_size: pageSize })}`),
  createRate: (data: ExchangeRateInput) =>
    request<SingleResponse<ExchangeRate>>("/currency/exchange-rates", { method: "POST", body: JSON.stringify(data) }),
  /** The rate a new document would get (tenant rate, else platform rate); 404/422 when none exists. */
  lookup: (from: string, to?: string, at?: string) =>
    request<SingleResponse<ResolvedRate>>(`/currency/exchange-rates/lookup${qs({ from, to, at })}`),

  // Super-admin only.
  adminSettings: () => request<SingleResponse<PlatformCurrencySettings>>("/admin/currency/settings"),
  setReportingCurrency: (currency: string) =>
    request<SingleResponse<PlatformCurrencySettings>>("/admin/currency/settings/reporting-currency", {
      method: "PUT", body: JSON.stringify({ currency }),
    }),
  adminListRates: (page = 1, pageSize = 20) =>
    request<PaginatedResponse<ExchangeRate>>(`/admin/currency/exchange-rates${qs({ page, page_size: pageSize })}`),
  adminCreateRate: (data: ExchangeRateInput) =>
    request<SingleResponse<ExchangeRate>>("/admin/currency/exchange-rates", { method: "POST", body: JSON.stringify(data) }),
};
