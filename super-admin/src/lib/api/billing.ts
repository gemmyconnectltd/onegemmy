import { request, downloadFile } from "./client";

export interface BillingTerms {
  id?: string; version?: number; currency: string; monthly: number; annual: number;
  seat_monthly: number; branch_monthly: number; included_users: number; included_branches: number;
  max_users: number | null; max_branches: number | null; max_products: number | null;
  max_storage_mb: number | null; modules: string[]; trial_days: number; tax_bps: number;
  bill_active_users: boolean;
}
export interface BillingPlan {
  id: string; name: string; description: string; status: "draft" | "active" | "archived";
  version: number; prices: BillingTerms[];
}
export interface BillingSubscription {
  id: string; tenant_id: string; tenant_name?: string; plan_id: string; plan_name?: string; cycle: "monthly" | "annual";
  currency: string; status: string; recurring: number; seats: number; branches: number;
  terms: BillingTerms; credit: number; period_start: string; period_end: string;
  trial_end: string | null; cancel_at_end: boolean; revision: number; discount_bps: number;
}
export interface BillingInvoice {
  id: string; tenant_id: string; tenant_name?: string; subscription_id: string;
  number: string; currency: string; created_at: string; due_at: string; period_start: string;
  period_end: string; status: string; subtotal: number; tax: number; total: number; paid: number;
  lines: { description: string; amount: number; credit_applied?: number }[];
}
export interface BillingPayment {
  id: string; tenant_id: string; tenant_name?: string; invoice_id: string; reference: string;
  currency: string; amount: number; status: string; provider: string; method: string;
  failure_reason: string | null; created_at: string;
}
export interface BillingRefund {
  id: string; tenant_id: string; tenant_name?: string; payment_id: string; reference: string;
  number: string; amount: number; currency: string; status: string; reason: string; created_at: string;
}
export interface BillingOverview {
  enrollment_required: boolean;
  subscription: BillingSubscription | null; legacy_plan: string | null; plan_name: string | null;
  usage: { users: number; branches: number }; outstanding: { currency: string; amount: number }[];
}
export interface BillingQuote {
  quote_id: string; expires_at: string; currency: string; plan_name: string; cycle: string;
  recurring: number; subtotal: number; tax: number; discount: number; due_now: number;
  adjustment: number; credit_applied: number; credit_added: number; effective_at: string;
  period_end: string; seats: number; branches: number; trial: boolean;
}
export interface PaymentMethods {
  provider: string; mode: string; configured: boolean; saved_methods_supported: boolean;
  signed_requests_required?: boolean; signing_configured?: boolean;
  methods: { provider: string; name: string; currency: string; country: string; prefix: string }[];
}
export interface BillingSettings { require_new_businesses: boolean; grace_days: number; due_days: number; reminder_days: number; invoice_prefix: string }
export interface BillingReport {
  updated_at: string | null;
  subscriptions: { currency: string; plan_id: string; status: string; subscriptions: number; mrr: number }[];
  outstanding: { currency: string; amount: number; count: number }[];
  payments: { currency: string; status: string; count: number; amount: number }[];
}
export interface BillingPage<T> { items: T[]; total: number; page: number; page_size: number; total_pages: number }
export interface BillingRecords { plans: BillingPlan; subscriptions: BillingSubscription; invoices: BillingInvoice; payments: BillingPayment }
export type BillingKind = keyof BillingRecords;
export type BillingFilters = { page?: number; page_size?: number; q?: string; status?: string; currency?: string; plan_id?: string; invoice_id?: string; payment_id?: string; tenant_id?: string; from_date?: string; to_date?: string };
interface Envelope<T> { data: T }
export interface ChangePlanInput { plan_id: string; currency: string; cycle: "monthly" | "annual" }
export interface SubscriptionActionInput { action: "cancel" | "reactivate" | "extend_trial" | "discount"; reason: string; at_period_end?: boolean; days?: number; discount_bps?: number }
function query(filters: object): string {
  return new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
}
export interface EnrollInput { mode: "trial" | "complimentary"; trial_days: number; keep_modules: boolean; notify: boolean; dry_run: boolean; confirm_count?: number }
export interface EnrollResult {
  dryRun: boolean; mode: string; trialDays: number; keepModules: boolean; candidates: number; toEnroll: number; skippedCount: number;
  byPlan: { plan: string; businesses: number; currencies: Record<string, number> }[]; skipped: { id: string; name: string; reason: string }[];
  sample: { id: string; name: string; plan: string; currency: string }[]; enrolled?: number; failed?: { id: string; name: string; reason: string }[];
}
export function createBillingApi(base: string) {
  const post = <T>(path: string, data: object, key: string) => request<Envelope<T>>(`${base}${path}`, { method: "POST", body: JSON.stringify(data), headers: { "Idempotency-Key": key } });
  return {
    records: <K extends BillingKind>(kind: K, filters: BillingFilters) => request<Envelope<BillingPage<BillingRecords[K]>>>(`${base}/${kind}?${query(filters)}`),
    detail: <K extends BillingKind>(kind: K, id: string) => request<Envelope<BillingRecords[K]>>(`${base}/${kind}/${id}`),
    overview: (tenantId?: string) => request<Envelope<BillingOverview>>(`${base}${tenantId ? `/tenants/${tenantId}` : "/overview"}`),
    preview: (data: ChangePlanInput, tenantId?: string) => post<BillingQuote>(`${tenantId ? `/tenants/${tenantId}` : ""}/preview`, data, crypto.randomUUID()),
    confirm: (quoteId: string, key: string, tenantId?: string) => post<{ subscription: BillingSubscription; invoice: BillingInvoice | null }>(`${tenantId ? `/tenants/${tenantId}` : ""}/confirm`, { quote_id: quoteId }, key),
    action: (data: SubscriptionActionInput, key: string, tenantId?: string) => post<BillingSubscription>(`${tenantId ? `/tenants/${tenantId}` : ""}/subscription`, data, key),
    creditNote: (id: string) => downloadFile(`${base}/refunds/${id}/pdf`, "credit-note.pdf"),
    history: (id: string, page: number) => request<Envelope<BillingPage<{ id: string; created_at: string; actor_name: string | null; action: string; summary: string; changes: { reason?: string } | null }>>>(`${base}/subscriptions/${id}/history?page=${page}&page_size=20`),
    refunds: (filters: BillingFilters) => request<Envelope<BillingPage<BillingRefund>>>(`${base}/refunds?${query(filters)}`),
    refund: (reference: string, amount: number, reason: string, key: string) => post<BillingRefund>(`/payments/${reference}/refund`, { amount, reason }, key),
    refreshRefund: (reference: string) => post<BillingRefund>(`/refunds/${reference}/refresh`, {}, crypto.randomUUID()),
    methods: () => request<Envelope<PaymentMethods>>(`${base}/payment-methods`),
    pay: (id: string, phone: string, provider: string, key: string) => post<BillingPayment>(`/invoices/${id}/pay`, { phone, provider }, key),
    refresh: (reference: string) => post<BillingPayment>(`/payments/${reference}/refresh`, {}, crypto.randomUUID()),
    pdf: (id: string, receipt?: string) => downloadFile(`${base}/invoices/${id}/pdf${receipt ? `?receipt=${receipt}` : ""}`, receipt ? "receipt.pdf" : "invoice.pdf"),
    savePlan: (data: Omit<BillingPlan, "id" | "version"> & { expected_version?: number }, key: string, id?: string) => request<Envelope<BillingPlan>>(`${base}/plans${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(data), headers: { "Idempotency-Key": key } }),
    settings: () => request<Envelope<BillingSettings>>(`${base}/settings`),
    enrollExisting: (d: EnrollInput) => request<Envelope<EnrollResult>>(`${base}/enroll-existing`, { method: "POST", body: JSON.stringify(d) }),
    saveSettings: (data: BillingSettings) => request<Envelope<BillingSettings>>(`${base}/settings`, { method: "PUT", body: JSON.stringify(data) }),
    report: (filters: BillingFilters) => request<Envelope<BillingReport>>(`${base}/overview?${query(filters)}`),
  };
}
