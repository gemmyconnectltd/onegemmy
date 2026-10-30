// TanStack Query hooks for the Super Admin portal. Same conventions as the customer app: pages read data through
// these hooks (no hand-rolled useEffect + fetch), keyed per resource so mutations invalidate only what they touch.

import { useQuery, useMutation, useQueryClient, keepPreviousData, type UseMutationOptions } from "@tanstack/react-query";
import { adminApi, currencyApi, aiApi } from "@/lib/api";
import type {
  AdminUserFilters, EngagementCategory, EngagementQuery, UsagePeriod,
} from "@/lib/api";

const CURRENCY_KEY = ["currency"] as const;
const AI_KEY = ["ai"] as const;

// ── helpers ──────────────────────────────────────────────────────────────────

type QueryOpts = { enabled?: boolean; refetchInterval?: number; staleTime?: number; retry?: boolean | number };

function useQ<TResponse, TSelected, TKey extends unknown[]>(
  key: TKey,
  queryFn: () => Promise<TResponse>,
  select: (res: TResponse) => TSelected,
  opts?: QueryOpts,
) {
  return useQuery({
    queryKey: key,
    queryFn,
    select,
    // Keeps the previous page's data on screen (instead of flashing to a
    // loading state) while a new query key — e.g. the next page, a search
    // term, a filter — is in flight. `isFetching` still flips true/false so
    // callers can show a subtle "updating" affordance if they want one.
    placeholderData: keepPreviousData,
    ...opts,
  });
}

function mutation<TVariables, TResponse>(
  fn: (variables: TVariables) => Promise<TResponse>,
  invalidateKeys: (unknown[])[],
) {
  return function useApiMutation(options?: UseMutationOptions<TResponse, Error, TVariables>) {
    const qc = useQueryClient();
    return useMutation<TResponse, Error, TVariables>({
      ...options,
      mutationFn: fn,
      onSuccess: async (data, variables, context, mutationContext) => {
        await Promise.all(invalidateKeys.map((key) => qc.invalidateQueries({ queryKey: key })));
        options?.onSuccess?.(data, variables, context, mutationContext);
      },
    });
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

const ADMIN_STATS = ["admin", "stats"] as const;
const ADMIN_ANALYTICS = ["admin", "analytics"] as const;
const TENANTS = ["admin", "tenants"] as const;

export const useAdminStats = (opts?: QueryOpts) =>
  useQ([...ADMIN_STATS], () => adminApi.stats(), (r) => r.data, opts);

export const useAdminTenantAnalytics = (opts?: QueryOpts) =>
  useQ(["admin", "tenant-analytics"], () => adminApi.tenantAnalytics(), (r) => r.data, opts);

export const useAdminFeatureUsage = (opts?: QueryOpts) =>
  useQ(["admin", "feature-usage"], () => adminApi.featureUsage(), (r) => r.data, opts);

export const useAdminUsageBreakdown = (opts?: QueryOpts) =>
  useQ(["admin", "usage-breakdown"], () => adminApi.usageBreakdown(), (r) => r.data, opts);

// Platform Overview analytics. The backend caches these for a short window, so
// the client also treats them as fresh for 60s — changing the period or a
// filter only refetches the queries whose key actually changed.
const analyticsKey = (name: string, ...rest: unknown[]) => [...ADMIN_ANALYTICS, name, ...rest];
const ANALYTICS_OPTS = { staleTime: 60_000 } as const;

export const useAnalyticsOverview = (q: Parameters<typeof adminApi.analyticsOverview>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("overview", q), () => adminApi.analyticsOverview(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

export const useAnalyticsGrowth = (q: Parameters<typeof adminApi.analyticsGrowth>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("growth", q), () => adminApi.analyticsGrowth(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

export const useAnalyticsPlatformStatus = (q: Parameters<typeof adminApi.analyticsPlatformStatus>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("platform-status", q), () => adminApi.analyticsPlatformStatus(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

export const useAnalyticsSignupInsights = (q: Parameters<typeof adminApi.analyticsSignupInsights>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("signup-insights", q), () => adminApi.analyticsSignupInsights(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

export const useAnalyticsSignupInsightsAll = (q: Parameters<typeof adminApi.analyticsSignupInsightsAll>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("signup-insights-all", q), () => adminApi.analyticsSignupInsightsAll(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

export const useWebsiteTraffic = (q: Parameters<typeof adminApi.analyticsTraffic>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("traffic", q), () => adminApi.analyticsTraffic(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

type RangeQ = { from?: string; to?: string };
export const useTrafficSources = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("traffic-sources", q), () => adminApi.analyticsTrafficSources(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useTrafficPages = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("traffic-pages", q), () => adminApi.analyticsTrafficPages(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useTrafficCampaigns = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("traffic-campaigns", q), () => adminApi.analyticsTrafficCampaigns(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });

export const useErpTraffic = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("erp-traffic", q), () => adminApi.erpTraffic(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useErpModules = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("erp-modules", q), () => adminApi.erpTrafficModules(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useErpBusinesses = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("erp-businesses", q), () => adminApi.erpTrafficBusinesses(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useErpDevices = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("erp-devices", q), () => adminApi.erpTrafficDevices(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useErpEngagement = (q: RangeQ, opts?: QueryOpts) =>
  useQ(analyticsKey("erp-engagement", q), () => adminApi.erpTrafficEngagement(q), (r) => r.data, { ...ANALYTICS_OPTS, ...opts });
export const useErpRealtime = () =>
  useQ([...ADMIN_ANALYTICS, "erp-realtime"], () => adminApi.erpTrafficRealtime(), (r) => r.data, { refetchInterval: 30_000, staleTime: 15_000 });

export const useWebsiteTrafficRealtime = () =>
  useQ([...ADMIN_ANALYTICS, "traffic-realtime"], () => adminApi.analyticsTrafficRealtime(), (r) => r.data, { refetchInterval: 30_000, staleTime: 15_000 });

export const useAnalyticsRecentTenants = (q: Parameters<typeof adminApi.analyticsRecentTenants>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("recent-tenants", q), () => adminApi.analyticsRecentTenants(q), (r) => r.data.items, { ...ANALYTICS_OPTS, ...opts });

// Filter dropdown values change rarely — keep them for 5 minutes.
export const useAnalyticsFilterOptions = (q: Parameters<typeof adminApi.analyticsFilterOptions>[0], opts?: QueryOpts) =>
  useQ(analyticsKey("filter-options", q), () => adminApi.analyticsFilterOptions(q), (r) => r.data, { staleTime: 5 * 60_000, ...opts });

export const useUsers = (page = 1, pageSize = 50, filters: AdminUserFilters = {}, opts?: QueryOpts) =>
  useQ(["admin", "users", page, pageSize, filters], () => adminApi.listUsers(page, pageSize, filters), (r) => r.data, opts);

export const useTenants = (page = 1, pageSize = 20, opts?: QueryOpts, filters: Record<string, string> = {}) =>
  useQ([...TENANTS, page, pageSize, filters], () => adminApi.listTenants(page, pageSize, filters), r => r.data, opts);

export const useAudience = (page = 1, pageSize = 25, filters: Record<string, string> = {}) =>
  useQ(["admin", "audience", page, pageSize, filters], () => adminApi.listAudience(page, pageSize, filters), r => r.data);

export const useSendOutreach = mutation((d: Parameters<typeof adminApi.sendOutreach>[0]) => adminApi.sendOutreach(d), [["admin", "audience"]]);

export const useTenant = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id], () => adminApi.getTenant(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useTenantStats = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "stats"], () => adminApi.tenantStats(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useTenantUsers = (id: string | undefined, page = 1, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "users", page], () => adminApi.tenantUsers(id!, page), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useTenantDepartments = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "departments"], () => adminApi.tenantDepartments(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useTenantRoles = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "roles"], () => adminApi.tenantRoles(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useTenantBranches = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "branches"], () => adminApi.tenantBranches(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useCreateTenant = mutation((d: Parameters<typeof adminApi.createTenant>[0]) => adminApi.createTenant(d), [[...TENANTS], [...ADMIN_STATS], [...ADMIN_ANALYTICS], ["admin", "feature-usage"], ["admin", "tenant-analytics"], ["admin", "usage-breakdown"]]);
export const useUpdateTenant = mutation(({ id, data }: { id: string; data: Parameters<typeof adminApi.updateTenant>[1] }) => adminApi.updateTenant(id, data), [[...TENANTS], [...ADMIN_STATS], [...ADMIN_ANALYTICS], ["admin", "feature-usage"], ["admin", "tenant-analytics"], ["admin", "usage-breakdown"]]);
export const useSuspendTenant = mutation(({ id, body }: { id: string; body: Parameters<typeof adminApi.suspendTenant>[1] }) => adminApi.suspendTenant(id, body), [[...TENANTS], [...ADMIN_STATS], [...ADMIN_ANALYTICS], ["admin", "feature-usage"], ["admin", "tenant-analytics"], ["admin", "usage-breakdown"]]);
export const useActivateTenant = mutation(({ id }: { id: string }) => adminApi.activateTenant(id), [[...TENANTS], [...ADMIN_STATS], [...ADMIN_ANALYTICS], ["admin", "feature-usage"], ["admin", "tenant-analytics"], ["admin", "usage-breakdown"]]);
export const useResetTenantData = mutation(({ id, confirmName }: { id: string; confirmName: string }) => adminApi.resetTenantData(id, confirmName), [[...TENANTS], [...ADMIN_STATS], [...ADMIN_ANALYTICS], ["admin", "feature-usage"], ["admin", "tenant-analytics"], ["admin", "usage-breakdown"]]);
export const useInviteUser = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.inviteUser>[1] }) => adminApi.inviteUser(tenantId, data), [[...TENANTS], [...ADMIN_ANALYTICS]]);
export const useDeleteUser = mutation(({ tenantId, userId }: { tenantId: string; userId: string }) => adminApi.deleteUser(tenantId, userId), [[...TENANTS], [...ADMIN_ANALYTICS]]);

export const useCreateDepartment = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.createDepartment>[1] }) => adminApi.createDepartment(tenantId, data), [[...TENANTS]]);
export const useDeleteDepartment = mutation(({ tenantId, departmentId }: { tenantId: string; departmentId: string }) => adminApi.deleteDepartment(tenantId, departmentId), [[...TENANTS]]);

export const useCreateRole = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.createRole>[1] }) => adminApi.createRole(tenantId, data), [[...TENANTS]]);
export const useDeleteRole = mutation(({ tenantId, roleId }: { tenantId: string; roleId: string }) => adminApi.deleteRole(tenantId, roleId), [[...TENANTS]]);

export const useCreateBranch = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.createBranch>[1] }) => adminApi.createBranch(tenantId, data), [[...TENANTS]]);
export const useDeleteBranch = mutation(({ tenantId, branchId }: { tenantId: string; branchId: string }) => adminApi.deleteBranch(tenantId, branchId), [[...TENANTS]]);

export const useTenantFeatures = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "features"], () => adminApi.tenantFeatures(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useTenantLimits = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...TENANTS, id, "limits"], () => adminApi.tenantLimits(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useFeatureDirectory = (opts?: QueryOpts) => useQ(["admin", "features", "directory"], () => adminApi.featureDirectory(), (r) => r.data, opts);
export const useFeatureDetail = (key: string, opts?: QueryOpts) => useQ(["admin", "features", "detail", key], () => adminApi.featureDetail(key), (r) => r.data, opts);
export const useUpdateFeature = mutation(({ key, data }: { key: string; data: Parameters<typeof adminApi.updateFeature>[1] }) => adminApi.updateFeature(key, data), [["admin", "features"]]);
export const useSetTenantFeatures = mutation(({ tenantId, features }: { tenantId: string; features: Record<string, boolean> }) => adminApi.setTenantFeatures(tenantId, { features }), [[...TENANTS]]);
export const useResetTenantFeatures = mutation((tenantId: string) => adminApi.resetTenantFeatures(tenantId), [[...TENANTS]]);
export const useSetTenantLimits = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.setTenantLimits>[1] }) => adminApi.setTenantLimits(tenantId, data), [[...TENANTS]]);
export const useResetUserPassword = mutation(({ tenantId, userId }: { tenantId: string; userId: string }) => adminApi.sendRecoveryLink(tenantId, userId), [[...TENANTS]]);

// ── Platform currency ───────────────────────────────────────────────────────────────────────────

// Platform (super-admin): reporting currency + platform-wide rates.
export const usePlatformCurrencySettings = (opts?: QueryOpts) =>
  useQ([...CURRENCY_KEY, "platform", "settings"], () => currencyApi.adminSettings(), (r) => r.data, opts);

export const useSetReportingCurrency = mutation(
  (currency: string) => currencyApi.setReportingCurrency(currency),
  [[...CURRENCY_KEY], [...ADMIN_ANALYTICS], [...ADMIN_STATS]],
);

export const useAdminExchangeRates = (page = 1, pageSize = 20, opts?: QueryOpts) =>
  useQ([...CURRENCY_KEY, "platform", "rates", page, pageSize], () => currencyApi.adminListRates(page, pageSize), (r) => r.data, opts);

export const useAdminCreateExchangeRate = mutation(
  (d: Parameters<typeof currencyApi.adminCreateRate>[0]) => currencyApi.adminCreateRate(d),
  [[...CURRENCY_KEY], [...ADMIN_ANALYTICS]],
);

// ── Pesaa AI (platform settings and usage) ─────────────────────────────────────────────────────

// Super-admin
export const useAiAdminSettings = (opts?: QueryOpts) => useQ([...AI_KEY, "admin", "settings"], () => aiApi.adminSettings(), (r) => r.data, opts);
export const useUpdateAiSettings = mutation(
  (d: Parameters<typeof aiApi.updateAdminSettings>[0]) => aiApi.updateAdminSettings(d),
  [[...AI_KEY]],
);
export const useAiAdminUsage = (days = 30, opts?: QueryOpts) => useQ([...AI_KEY, "admin", "usage", days], () => aiApi.adminUsage(days), (r) => r.data, opts);


export const useFeatureFlags = (opts?: QueryOpts) =>
  useQ(["admin", "features"], () => adminApi.listFeatures(), (r) => r.data, opts);

export const usePlatformAuditLogs = (page = 1, pageSize = 100, opts?: QueryOpts) =>
  useQ(["admin", "audit-logs", page, pageSize], () => adminApi.platformAuditLogs(page, pageSize), (r) => r.data, opts);


// Authoritative platform subscription billing (separate from ERP sales invoices).
import { createBillingApi, type BillingKind, type BillingFilters, type ChangePlanInput, type SubscriptionActionInput, type BillingPlan, type BillingSettings } from "./billing";
export const billingApi = createBillingApi("/admin/billing");
const BILLING = ["platform-billing"];
export const useBillingRecords = <K extends BillingKind>(kind: K, filters: BillingFilters, enabled = true) => useQ([...BILLING, kind, filters], () => billingApi.records(kind, filters), r => r.data, { enabled });
export const useBillingOverview = (tenantId?: string) => useQ([...BILLING, "overview", tenantId], () => billingApi.overview(tenantId), r => r.data);
export const useBillingDetail = <K extends BillingKind>(kind: K, id: string) => useQ([...BILLING, kind, id], () => billingApi.detail(kind, id), r => r.data, { enabled: !!id });
export const useBillingMethods = () => useQ([...BILLING, "methods"], () => billingApi.methods(), r => r.data);
export const useBillingPreview = mutation((v: { data: ChangePlanInput; tenantId?: string }) => billingApi.preview(v.data, v.tenantId), []);
export const useBillingConfirm = mutation((v: { quoteId: string; key: string; tenantId?: string }) => billingApi.confirm(v.quoteId, v.key, v.tenantId), [BILLING, [...TENANTS], [...ADMIN_STATS], ["admin", "usage-breakdown"], ["tenant-entitlements"]]);
export const useBillingAction = mutation((v: { data: SubscriptionActionInput; key: string; tenantId?: string }) => billingApi.action(v.data, v.key, v.tenantId), [BILLING]);
export const useBillingPay = mutation((v: { id: string; phone: string; provider: string; key: string }) => billingApi.pay(v.id, v.phone, v.provider, v.key), [BILLING]);
export const useBillingRefresh = mutation((reference: string) => billingApi.refresh(reference), [BILLING]);
export const useBillingSavePlan = mutation((v: { data: Omit<BillingPlan, "id" | "version"> & { expected_version?: number }; key: string; id?: string }) => billingApi.savePlan(v.data, v.key, v.id), [BILLING]);
export const useBillingSettings = () => useQ([...BILLING, "settings"], () => billingApi.settings(), r => r.data);
export const useBillingSaveSettings = mutation((v: BillingSettings) => billingApi.saveSettings(v), [BILLING]);
export const useBillingReport = (filters: BillingFilters) => useQ([...BILLING, "report", filters], () => billingApi.report(filters), r => r.data);

export const useBillingRefunds = (filters: BillingFilters) => useQ([...BILLING, "refunds", filters], () => billingApi.refunds(filters), r => r.data);
export const useBillingRefund = mutation((v: { reference: string; amount: number; reason: string; key: string }) => billingApi.refund(v.reference, v.amount, v.reason, v.key), [BILLING]);
export const useBillingRefreshRefund = mutation((reference: string) => billingApi.refreshRefund(reference), [BILLING]);

export const useBillingHistory = (id: string, page: number) => useQ([...BILLING, "history", id, page], () => billingApi.history(id, page), r => r.data, { enabled: !!id });

// Platform Usage drill-downs — each page keeps its own page/search/period in the query key.
export const useUsageEngagement = (category: EngagementCategory, f: EngagementQuery, opts?: QueryOpts) =>
  useQ(["admin", "usage", "engagement", category, f], () => adminApi.usageEngagement(category, f), (r) => r.data, opts);
export const useUsageModule = (key: string, period: UsagePeriod, f: { page: number; q: string; status: string }, opts?: QueryOpts) =>
  useQ(["admin", "usage", "module", key, period, f], () => adminApi.usageModule(key, period, f), (r) => r.data, opts);
export const useUsageSales = (currency: string, period: UsagePeriod, f: { page: number; q: string }, opts?: QueryOpts) =>
  useQ(["admin", "usage", "sales", currency, period, f], () => adminApi.usageSales(currency, period, f), (r) => r.data, opts);
export const useUsageTenant = (id: string, opts?: QueryOpts) =>
  useQ(["admin", "usage", "tenant", id], () => adminApi.usageTenant(id), (r) => r.data, opts);

const OPS = [["admin", "tenant-ops"]] as unknown as unknown[][];
export const useTenantNotifications = (id: string, opts?: QueryOpts) => useQ(["admin", "tenant-ops", "notifications", id], () => adminApi.notifications(id), (r) => r.data, opts);
export const useSendTenantNotification = mutation(({ id, body }: { id: string; body: Parameters<typeof adminApi.sendNotification>[1] }) => adminApi.sendNotification(id, body), OPS);
export const useTenantExports = (id: string, opts?: QueryOpts) => useQ(["admin", "tenant-ops", "exports", id], () => adminApi.exports(id), (r) => r.data, opts);
export const useRequestTenantExport = mutation(({ id, body }: { id: string; body: Parameters<typeof adminApi.requestExport>[1] }) => adminApi.requestExport(id, body), OPS);
export const useArchiveRequests = (id: string, opts?: QueryOpts) => useQ(["admin", "tenant-ops", "archive", id], () => adminApi.archiveRequests(id), (r) => r.data, opts);
export const useRequestArchive = mutation(({ id, body }: { id: string; body: Parameters<typeof adminApi.requestArchive>[1] }) => adminApi.requestArchive(id, body), [...OPS, [...TENANTS]]);
export const useDecideArchive = mutation(({ id, requestId, action, note }: { id: string; requestId: string; action: "approve" | "reject" | "cancel"; note?: string }) => adminApi.decideArchive(id, requestId, action, note), [...OPS, [...TENANTS], [...ADMIN_STATS], [...ADMIN_ANALYTICS]]);
