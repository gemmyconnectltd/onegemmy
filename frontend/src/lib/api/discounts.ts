import type { TaxPreview } from "./sales";
import { request, qs } from "./client";
import type { SingleResponse, PaginatedResponse } from "./types";

export type DiscountFlags = "enabled" | "manual_pos" | "automatic" | "campaigns" | "coupons" | "approvals" | "advanced";
export type DiscountSettings = Record<DiscountFlags, boolean> & { authority: { default_percent: number; roles: Record<string, number> }; effective?: Record<DiscountFlags, boolean> };
export interface DiscountRule { id: string; name: string; code: string; description?: string; type: string; status: string; value_kind: string; value: number; max_discount?: number; max_combined_pct?: number | null; config: Record<string, unknown>; priority: number; combinable: boolean; exclusive: boolean; starts_at?: string; ends_at?: string; campaign_id?: string; created_at?: string; updated_at?: string; usage_count?: number; discount_total?: string; campaign_name?: string | null }
export interface DiscountRuleFilters { search?: string; status?: string; type?: string }
export interface DiscountUsage { id: string; order_id: string; order_number: string; order_status: string; date: string; branch: string | null; customer: string | null; kind: string; coupon_code: string | null; amount: string }
export interface DiscountHistory { action: string; summary: string; actor: string | null; changes: Record<string, unknown> | null; at: string }
export interface DiscountCampaign { id: string; name: string; code: string; status: string; starts_at?: string; ends_at?: string; description?: string }
export interface DiscountCoupon { id: string; rule_id: string; code: string; status: string; redeemed_count: number; max_redemptions?: number; per_customer_limit?: number | null; expires_at?: string | null }
export interface DiscountPriceInput { manual_reason?: string; items: { product_id: string | null; variant_id?: string | null; unit_price: number; quantity: number; discount?: number }[]; customer_id?: string | null; channel: "pos" | "sales_order" | "quotation"; coupon_codes?: string[]; manual_discount?: { kind: "percent" | "fixed"; value: number; reason?: string }; discount_approval_id?: string }
export interface DiscountPrice { approval_status?: "pending" | "approved" | "not_required"; coupon_errors?: string[]; valid_until?: string; product_discount_total: string; order_discount_total: string; coupon_discount_total: string; pricing_hash: string; vat?: TaxPreview; subtotal: string; total_discount: string; net_subtotal: string; tax: string; total: string; approval_required: boolean; blocked: string | null; context_hash: string; lines: { ref: string; discount: string; net: string; gross: string; rules: { name: string; amount: string; kind: string }[] }[]; applied: { rule_id: string | null; name: string; type: string; kind: string; amount: string; explanation: string; coupon_code?: string; lines: Record<string, string> }[] }
export interface DiscountOverview { active_rules: number; scheduled_campaigns: number; total_discounts: string; discounted_sales: number; coupon_redemptions: number; pending_approvals: number; activity: { action: string; summary: string; created_at: string }[] }
export interface DiscountAnalytics { rule_name: string; kind: string; amount: number; sales: number }
const base = "/tenants/sales/discounts";
export const discountsApi = {
  catalog: async (body: CatalogPriceInput): Promise<SingleResponse<CatalogPrices>> => {
    const batches = Array.from({ length: Math.ceil(body.products.length / 200) }, (_, index) => body.products.slice(index * 200, (index + 1) * 200));
    const responses = await Promise.all(batches.map(products => request<SingleResponse<CatalogPrices>>(`${base}/catalog/preview`, { method: "POST", body: JSON.stringify({ ...body, products }) })));
    const first = responses[0];
    return { ...first, data: { ...first.data, items: responses.flatMap(response => response.data.items), valid_until: responses.map(response => response.data.valid_until).sort()[0] } };
  },
  overview: () => request<SingleResponse<DiscountOverview>>(`${base}/overview`),
  settings: () => request<SingleResponse<DiscountSettings>>(`${base}/settings`),
  saveSettings: (body: Partial<DiscountSettings>) => request<SingleResponse<DiscountSettings>>(`${base}/settings`, { method: "PATCH", body: JSON.stringify(body) }),
  rules: (page = 1, filters: DiscountRuleFilters = {}) => request<PaginatedResponse<DiscountRule>>(`${base}/rules${qs({ page, page_size: 25, search: filters.search || undefined, status: filters.status || undefined, type: filters.type || undefined })}`),
  rule: (id: string) => request<SingleResponse<DiscountRule>>(`${base}/rules/${encodeURIComponent(id)}`),
  ruleUsage: (id: string, page = 1) => request<PaginatedResponse<DiscountUsage>>(`${base}/rules/${encodeURIComponent(id)}/usage${qs({ page, page_size: 25 })}`),
  ruleHistory: (id: string) => request<SingleResponse<DiscountHistory[]>>(`${base}/rules/${encodeURIComponent(id)}/history`),
  saveRule: ({ id, ...body }: Record<string, unknown> & { id?: string }) => request<SingleResponse<DiscountRule>>(`${base}/rules${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(body) }),
  status: ({ resource, id, status }: { resource: "rules" | "campaigns" | "coupons"; id: string; status: string }) => request<SingleResponse<DiscountRule>>(`${base}/${resource}/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  campaigns: (page = 1, status?: string) => request<PaginatedResponse<DiscountCampaign>>(`${base}/campaigns${qs({ page, page_size: 25, status: status || undefined })}`),
  saveCampaign: (body: Record<string, unknown>) => request<SingleResponse<DiscountCampaign>>(`${base}/campaigns`, { method: "POST", body: JSON.stringify(body) }),
  coupons: (page = 1) => request<PaginatedResponse<DiscountCoupon>>(`${base}/coupons${qs({ page, page_size: 25 })}`),
  generateCoupons: (body: Record<string, unknown>) => request<SingleResponse<DiscountCoupon[]>>(`${base}/coupons`, { method: "POST", body: JSON.stringify(body) }),
  price: (body: DiscountPriceInput) => request<SingleResponse<DiscountPrice>>(`${base}/preview`, { method: "POST", body: JSON.stringify(body) }),
  requestApproval: (body: DiscountPriceInput & { reason: string }) => request<SingleResponse<{ id: string }>>(`${base}/approvals`, { method: "POST", body: JSON.stringify(body) }),
  analytics: (start?: string, end?: string) => request<SingleResponse<DiscountAnalytics[]>>(`${base}/analytics${qs({ start, end })}`),
};

export interface CatalogOffer { rule_id: string; name: string; type: string; label: string; conditional: boolean; saving?: string | null; description?: string }
export interface CatalogProductPrice { product_id: string; variant_id: string | null; original_unit_price: string; unit_price: string; savings: string; offers: CatalogOffer[]; quantity: string; price_context: string; price_approximate?: boolean; blocked: string | null }
export interface CatalogPrices { items: CatalogProductPrice[]; currency: string; evaluated_at: string; valid_until: string }
export interface CatalogPriceInput { products: { product_id: string; variant_id?: string | null }[]; customer_id?: string | null; cart?: DiscountPriceInput }
