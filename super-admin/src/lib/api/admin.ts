import { request, qs, downloadFilePost } from "./client";
import type { PaginatedResponse, SingleResponse } from "./types";

/** Attached only by listTenants (one batched query per page, not per tenant —
 *  see _tenant_usage_map on the backend) — absent on single-tenant fetches. */
export interface AdminTenantUsage {
  users: number;
  orders: number;
  completed_orders: number;
  revenue: number;
  products: number;
  last_active_at: string | null;
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  archived_at?: string | null;
  subscription_plan: string;
  subscription_status: string;
  currency: string;
  vat_enabled: boolean;
  multi_branch: boolean;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  created_at: string | null;
  business_type: string | null;
  industry: string | null;
  business_category: string | null;
  employee_count: string | null;
  business_location: string | null;
  heard_about: string | null;
  referral_code: string | null;
  /** How the business asked to be contacted first (chosen at registration). */
  preferred_contact?: "email" | "phone" | "whatsapp" | "all";
  usage?: AdminTenantUsage;
}

/** A tenant that registered itself but hasn't been approved yet is
 *  distinguished from one an admin suspended after the fact — both are
 *  `is_active: false`, but only the former has `subscription_status: "pending"`. */
export function tenantStatusLabel(t: Pick<AdminTenant, "is_active" | "subscription_status" | "archived_at">): "Active" | "Pending Approval" | "Suspended" | "Archived" {
  if (t.archived_at) return "Archived";
  if (t.is_active) return "Active";
  return t.subscription_status === "pending" ? "Pending Approval" : "Suspended";
}

export interface AdminTenantStats {
  users: number;
  orders: number;
  completed_orders: number;
  revenue: number;
  products: number;
}

export interface AdminPlatformStats {
  /** Tenant sales volume converted to `reporting_currency` — not PESAA's own revenue. */
  reporting_currency?: string;
  revenue_by_currency?: Record<string, number>;
  trial_tenants?: number;
  cancelled_tenants?: number;
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_users: number;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
  total_products: number;
  plans: Record<string, number>;
  plan_names?: Record<string, string>;
  monthly_signups: { month: string; count: number }[];
}

export interface AdminTenantAnalytics {
  by_country: { name: string; value: number }[];
  /** Every country with at least one user: users and businesses in it ("Unknown" = businesses with no country set). */
  users_by_country: { name: string; users: number; businesses: number }[];
  by_industry: { name: string; value: number }[];
  by_business_type: { name: string; value: number }[];
  by_heard_about: { name: string; value: number }[];
  by_status: { name: string; value: number }[];
  by_plan: { name: string; value: number }[];
  monthly_signups: { month: string; count: number }[];
}

export interface AdminFeatureUsageModule {
  key: string;
  label: string;
  tenants_using: number;
  total_records: number;
  adoption_pct: number;
}

export interface AdminFeatureUsage {
  total_tenants: number;
  modules: AdminFeatureUsageModule[];
}

export interface AdminUsageSummary {
  revenue_by_currency: Record<string, number>;
  reporting_currency?: string;
  total_tenants: number;
  engaged_tenants: number;
  dormant_tenants: number;
  active_30d: number;
  avg_users_per_tenant: number;
  avg_orders_per_tenant: number;
  total_orders: number;
  total_users: number;
  total_products: number;
  total_revenue: number;
}

export interface AdminEngagementTier {
  tier: "dormant" | "light" | "moderate" | "heavy";
  tenants: number;
}

export interface AdminPlanUsage {
  plan_name?: string;
  revenue_by_currency: Record<string, number>;
  plan: string;
  tenants: number;
  users: number;
  orders: number;
  completed_orders: number;
  revenue: number;
  products: number;
}

export interface AdminUsageTopTenant {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string;
  currency: string;
  is_active: boolean;
  users: number;
  orders: number;
  completed_orders: number;
  revenue: number;
  products: number;
  last_active_at: string | null;
}

export interface AdminUsageBreakdown {
  summary: AdminUsageSummary;
  engagement: AdminEngagementTier[];
  by_plan: AdminPlanUsage[];
  top_tenants: AdminUsageTopTenant[];
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
}

export interface AdminUserRow extends AdminUser {
  phone: string | null;
  updated_at: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
}

/** One row of the platform-wide audit trail (GET /admin/audit/logs). tenant_id is null for platform-level events. */
export interface AdminAuditLog {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  ip_address: string | null;
  created_at: string | null;
}

export interface AdminUserFilters {
  search?: string;
  tenant_id?: string;
  role?: string;
  status?: "active" | "inactive";
  created_from?: string; // YYYY-MM-DD
  created_to?: string; // YYYY-MM-DD
}

export type AdminUserExportScope = "filtered" | "all" | "current_page" | "selected";
export type AdminUserExportFormat = "xlsx" | "csv";

export interface AdminUserExportRequest extends AdminUserFilters {
  scope: AdminUserExportScope;
  format: AdminUserExportFormat;
  columns?: string[];
  page?: number;
  page_size?: number;
  selected_ids?: string[];
}

export interface AdminDepartment {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminRole {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminBranch {
  id: string;
  tenant_id: string;
  name: string;
  location: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface FeatureFlag {
  key: string;
  name: string;
  module: string;
  description: string | null;
  default_enabled: boolean;
  is_active: boolean;
}

export interface TenantFeatureState {
  key: string;
  name: string;
  module: string;
  description: string | null;
  default_enabled: boolean;
  enabled: boolean;
  overridden: boolean;
}

export interface TenantLimits {
  max_users: number | null;
  max_branches: number | null;
  max_products: number | null;
  max_storage_mb: number | null;
}


// ── Platform Overview analytics (GET /admin/analytics/*) ─────────────────────
// All aggregation and filtering happens on the server; these are the shapes.

export interface AnalyticsRange {
  from: string;
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
}

export type AnalyticsGroupBy = "day" | "week" | "month" | "year";

/** Global tenant filters — values are the raw ones stored on tenants (e.g. "Rwanda", "sole"). */
export interface AnalyticsFilters {
  country?: string;
  industry?: string;
  businessType?: string;
}

export interface AnalyticsQuery extends AnalyticsFilters {
  from?: string;
  to?: string;
}

export interface AnalyticsMetric {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  /** null when there is nothing to compare against (previous period was 0). */
  changePct: number | null;
  /** cumulative = running total at period end · period = only inside the period */
  scope: "cumulative" | "period";
  description: string;
  format: "number" | "currency";
  /** For currency metrics: the platform reporting currency `value` is expressed in. */
  currency?: string;
  /** Original per-currency amounts behind a converted total (tenants keep books in different currencies). */
  breakdown?: {
    currency: string;
    originalAmount: number;
    /** `originalAmount` in the reporting currency; null when no platform rate exists for that currency. */
    convertedAmount: number | null;
    missingRate: boolean;
  }[];
  /** Currencies left out of the converted total because no platform rate is set for them. */
  missingRates?: string[];
  /** true when the converted total is incomplete (some currency has no rate). */
  partial?: boolean;
}

export interface AnalyticsOverview {
  period: AnalyticsRange;
  currency: string;
  metrics: AnalyticsMetric[];
  generatedAt: string;
}

export type GrowthMetric = "tenants" | "users";

export interface GrowthPoint {
  period: string;
  newCount: number;
  totalCount: number;
}

export interface AnalyticsGrowth {
  metric: GrowthMetric;
  period: AnalyticsGroupBy;
  range: AnalyticsRange;
  data: GrowthPoint[];
}

export interface PlatformStatus {
  tenants: { total: number; active: number; suspended: number; pending: number };
  system: { status: "operational" | "degraded" | "down"; dbLatencyMs: number | null };
}

export type InsightDimension = "country" | "industry" | "business_type" | "heard_about";

export interface InsightItem {
  name: string;
  count: number;
  pct: number;
}

export interface InsightBlock {
  key: InsightDimension;
  range: AnalyticsRange;
  /** Tenants registered in the period under the active filters. */
  totalTenants: number;
  /** Set when a global filter was ignored because it would collapse this breakdown to one value. */
  ignoredFilter: InsightDimension | null;
  /** All tenants registered in the period under the active filters — the denominator for every pct. */
  total: number;
  /** Of those, tenants that provided a value for this dimension. */
  known: number;
  /** Tenants that left it blank (`total - known`), and their share of `total`. */
  unknown: number;
  unknownPct: number;
  distinct: number;
  items: InsightItem[];
  other: { count: number; pct: number; categories: number } | null;
  hasMore: boolean;
}

export interface RecentTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: "Active" | "Pending Approval" | "Suspended";
  country: string | null;
  createdAt: string | null;
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface FilterOptions {
  countries: FilterOption[];
  industries: FilterOption[];
  businessTypes: FilterOption[];
}

const B = "/admin";

export const adminApi = {
  stats: () => request<SingleResponse<AdminPlatformStats>>(`${B}/stats`),
  tenantAnalytics: () => request<SingleResponse<AdminTenantAnalytics>>(`${B}/tenant-analytics`),
  featureUsage: () => request<SingleResponse<AdminFeatureUsage>>(`${B}/feature-usage`),
  usageBreakdown: () => request<SingleResponse<AdminUsageBreakdown>>(`${B}/usage-breakdown`),

  // Platform Overview analytics — server-side aggregates and filtering, one call per dashboard section.
  analyticsOverview: (q: AnalyticsQuery) =>
    request<SingleResponse<AnalyticsOverview>>(`${B}/analytics/overview${qs({ ...q })}`),
  analyticsGrowth: (q: AnalyticsQuery & { metric: GrowthMetric; groupBy?: AnalyticsGroupBy }) =>
    request<SingleResponse<AnalyticsGrowth>>(`${B}/analytics/growth${qs({ ...q })}`),
  analyticsPlatformStatus: (q: AnalyticsQuery) =>
    request<SingleResponse<PlatformStatus>>(`${B}/analytics/platform-status${qs({ ...q })}`),
  analyticsSignupInsights: (q: AnalyticsQuery & { dimension: InsightDimension; limit?: number }) =>
    request<SingleResponse<InsightBlock>>(`${B}/analytics/signup-insights${qs({ ...q })}`),
  analyticsSignupInsightsAll: (q: AnalyticsQuery & { dimension: InsightDimension; page?: number; page_size?: number }) =>
    request<PaginatedResponse<InsightItem>>(`${B}/analytics/signup-insights/all${qs({ ...q })}`),
  analyticsRecentTenants: (q: AnalyticsFilters & { limit?: number }) =>
    request<SingleResponse<{ items: RecentTenant[] }>>(`${B}/analytics/recent-tenants${qs({ ...q })}`),
  analyticsFilterOptions: (q: AnalyticsFilters) =>
    request<SingleResponse<FilterOptions>>(`${B}/analytics/filter-options${qs({ ...q })}`),
  listUsers: (page = 1, pageSize = 50, filters: AdminUserFilters = {}) =>
    request<PaginatedResponse<AdminUserRow>>(`${B}/users${qs({ page, page_size: pageSize, ...filters })}`),
  exportUsers: (data: AdminUserExportRequest) =>
    downloadFilePost(`${B}/users/export`, data, `pesaa_users_${new Date().toISOString().slice(0, 10)}.${data.format}`),

  platformAuditLogs: (page = 1, pageSize = 100) =>
    request<PaginatedResponse<AdminAuditLog>>(`/admin/audit/logs?page=${page}&page_size=${pageSize}`),

  listTenants: (page = 1, pageSize = 20, filters: Record<string, string> = {}) =>
    request<PaginatedResponse<AdminTenant>>(`${B}/tenants${qs({ page, page_size: pageSize, ...filters })}`),
  createTenant: (data: { name: string; slug: string; owner_full_name: string; owner_email: string; phone?: string; city?: string; country?: string }) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants`, { method: "POST", body: JSON.stringify(data) }),
  getTenant: (id: string) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}`),
  updateTenant: (id: string, data: Partial<AdminTenant>) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  suspendTenant: (id: string) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}/suspend`, { method: "POST" }),
  activateTenant: (id: string) =>
    request<SingleResponse<AdminTenant>>(`${B}/tenants/${id}/activate`, { method: "POST" }),
  deleteTenant: (id: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${id}`, { method: "DELETE" }),
  resetTenantData: (id: string, confirmName: string) =>
    request<SingleResponse<{ deleted: Record<string, number> }>>(`${B}/tenants/${id}/reset-data`, {
      method: "POST",
      body: JSON.stringify({ confirm_name: confirmName }),
    }),

  tenantStats: (id: string) =>
    request<SingleResponse<AdminTenantStats>>(`${B}/tenants/${id}/stats`),
  tenantUsers: (id: string, page = 1) =>
    request<PaginatedResponse<AdminUser>>(`${B}/tenants/${id}/users?page=${page}&page_size=50`),
  inviteUser: (tenantId: string, data: { email: string; full_name: string; role: string; password?: string }) =>
    request<SingleResponse<AdminUser & { temp_password: string }>>(`${B}/tenants/${tenantId}/invite`, { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (tenantId: string, userId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/users/${userId}`, { method: "DELETE" }),

  tenantDepartments: (id: string, page = 1) =>
    request<PaginatedResponse<AdminDepartment>>(`${B}/tenants/${id}/departments?page=${page}&page_size=50`),
  createDepartment: (tenantId: string, data: { name: string; description?: string }) =>
    request<SingleResponse<AdminDepartment>>(`${B}/tenants/${tenantId}/departments`, { method: "POST", body: JSON.stringify(data) }),
  deleteDepartment: (tenantId: string, departmentId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/departments/${departmentId}`, { method: "DELETE" }),

  tenantRoles: (id: string, page = 1) =>
    request<PaginatedResponse<AdminRole>>(`${B}/tenants/${id}/roles?page=${page}&page_size=50`),
  createRole: (tenantId: string, data: { name: string; description?: string }) =>
    request<SingleResponse<AdminRole>>(`${B}/tenants/${tenantId}/roles`, { method: "POST", body: JSON.stringify(data) }),
  deleteRole: (tenantId: string, roleId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/roles/${roleId}`, { method: "DELETE" }),

  tenantBranches: (id: string, page = 1) =>
    request<PaginatedResponse<AdminBranch>>(`${B}/tenants/${id}/branches?page=${page}&page_size=50`),
  createBranch: (tenantId: string, data: { name: string; location?: string }) =>
    request<SingleResponse<AdminBranch>>(`${B}/tenants/${tenantId}/branches`, { method: "POST", body: JSON.stringify(data) }),
  deleteBranch: (tenantId: string, branchId: string) =>
    request<SingleResponse<unknown>>(`${B}/tenants/${tenantId}/branches/${branchId}`, { method: "DELETE" }),

  listFeatures: () =>
    request<SingleResponse<FeatureFlag[]>>(`${B}/features`),
  tenantFeatures: (tenantId: string) =>
    request<SingleResponse<TenantFeatureState[]>>(`${B}/tenants/${tenantId}/features`),
  setTenantFeatures: (tenantId: string, data: { features: Record<string, boolean> }) =>
    request<SingleResponse<TenantFeatureState[]>>(`${B}/tenants/${tenantId}/features`, { method: "PATCH", body: JSON.stringify(data) }),
  resetTenantFeatures: (tenantId: string) =>
    request<SingleResponse<TenantFeatureState[]>>(`${B}/tenants/${tenantId}/features/reset`, { method: "POST" }),
  tenantLimits: (tenantId: string) =>
    request<SingleResponse<TenantLimits>>(`${B}/tenants/${tenantId}/limits`),
  setTenantLimits: (tenantId: string, data: TenantLimits) =>
    request<SingleResponse<TenantLimits>>(`${B}/tenants/${tenantId}/limits`, { method: "PATCH", body: JSON.stringify(data) }),
  resetUserPassword: (tenantId: string, userId: string) =>
    request<SingleResponse<{ user_id: string; email: string; full_name: string; temp_password: string }>>(`${B}/tenants/${tenantId}/users/${userId}/reset-password`, { method: "POST" }),
};
