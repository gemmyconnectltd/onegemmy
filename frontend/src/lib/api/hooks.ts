// TanStack Query hooks for the API integration layer.
//
// Every data-fetching page/component should use these hooks instead of
// hand-rolled `useEffect` + `setState` calls. Caching, dedup, background
// refetch and invalidation are handled here, keyed per resource so mutations
// only invalidate what they actually touch.
//
// Queries return the unwrapped `data` payload (via `select`), so e.g.
// `useProducts().data?.items` is the list directly.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  inventoryApi, salesApi, financeApi, hrApi, departmentsApi, adminApi, procurementApi,
  crmApi, manufacturingApi,
  type ApiProduct, type ApiVariant, type ApiVariantListItem,
  type ApiCategory, type ApiBrand, type ApiUnit, type ApiSupplier,
  type InventoryValuationReport,
  type ApiCustomer, type ApiDeal, type ApiOrder, type ApiReturn, type ApiTarget,
  type TrialBalance, type IncomeStatement, type BalanceSheet,
  type CashFlowStatement, type GeneralLedger,
  type FinanceAccount, type FinanceExpense, type FinanceTransaction,
  type ApiDepartment, type ApiEmployee, type ApiAttendance,
  type ApiLeave, type ApiPayroll, type ApiApplicant,
  type AdminTenant, type AdminTenantStats, type AdminPlatformStats, type AdminUser,
  type AdminUserRow, type AdminDepartment, type AdminRole, type AdminBranch,
  type PurchaseOrder, type PurchaseItem, type PurchaseItemInput, type PurchaseCreateInput,
  type ApiCampaign, type ApiEmailLog,
  type ApiProductionOrder, type ApiProductionItem,
} from "@/lib/api";

// ── helpers ──────────────────────────────────────────────────────────────────

type QueryOpts = { enabled?: boolean; refetchInterval?: number };

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

// ── Inventory ────────────────────────────────────────────────────────────────

const PRODUCTS = ["inventory", "products"] as const;
const VARIANTS = ["inventory", "variants"] as const;
const VALUATION = ["inventory", "reports", "valuation"] as const;
const CATEGORIES = ["inventory", "categories"] as const;
const BRANDS = ["inventory", "brands"] as const;
const UNITS = ["inventory", "units"] as const;
const SUPPLIERS = ["inventory", "suppliers"] as const;

export const useProducts = (page = 1, pageSize = 100, opts?: QueryOpts) =>
  useQ([...PRODUCTS, page, pageSize], () => inventoryApi.listProducts(page, pageSize), (r) => r.data, opts);

export const useAllVariants = (page = 1, pageSize = 200, opts?: QueryOpts) =>
  useQ([...VARIANTS, page, pageSize], () => inventoryApi.listAllVariants(page, pageSize), (r) => r.data, opts);

export const useProductVariants = (productId: string | undefined, opts?: QueryOpts) =>
  useQ([...PRODUCTS, productId, "variants"], () => inventoryApi.listVariants(productId!), (r) => r.data, { ...opts, enabled: !!productId && (opts?.enabled ?? true) });

export const useCategories = (opts?: QueryOpts) =>
  useQ([...CATEGORIES], () => inventoryApi.listCategories(), (r) => r.data, opts);

export const useBrands = (opts?: QueryOpts) =>
  useQ([...BRANDS], () => inventoryApi.listBrands(), (r) => r.data, opts);

export const useUnits = (opts?: QueryOpts) =>
  useQ([...UNITS], () => inventoryApi.listUnits(), (r) => r.data, opts);

export const useSuppliers = (opts?: QueryOpts) =>
  useQ([...SUPPLIERS], () => inventoryApi.listSuppliers(), (r) => r.data, opts);

export const useValuationReport = (opts?: QueryOpts) =>
  useQ([...VALUATION], () => inventoryApi.valuationReport(), (r) => r.data, opts);

export const useCreateProduct = mutation((d: object) => inventoryApi.createProduct(d), [[...PRODUCTS], [...VALUATION], ["finance", "reports"], ["finance", "transactions"]]);
export const useBulkCreateProducts = mutation((items: object[]) => inventoryApi.bulkCreateProducts(items), [[...PRODUCTS], [...VALUATION], ["finance", "reports"]]);
export const useUpdateProduct = mutation(({ id, data }: { id: string; data: object }) => inventoryApi.updateProduct(id, data), [[...PRODUCTS], [...VALUATION], ["finance", "reports"], ["finance", "transactions"]]);
export const useDeleteProduct = mutation((id: string) => inventoryApi.deleteProduct(id), [[...PRODUCTS], [...VALUATION], ["finance", "reports"]]);
export const useRestockProduct = mutation(({ id, data }: { id: string; data: { qty: number; mode: string; reason?: string; notes?: string } }) => inventoryApi.restockProduct(id, data), [[...PRODUCTS], [...VALUATION], ["finance", "reports"], ["finance", "transactions"]]);
export const useUploadProductImage = mutation(({ id, file }: { id: string; file: File }) => inventoryApi.uploadProductImage(id, file), [[...PRODUCTS]]);

export const useCreateVariant = mutation(({ productId, data }: { productId: string; data: object }) => inventoryApi.createVariant(productId, data), [[...PRODUCTS], [...VARIANTS], [...VALUATION]]);
export const useUpdateVariant = mutation(({ productId, id, data }: { productId: string; id: string; data: object }) => inventoryApi.updateVariant(productId, id, data), [[...PRODUCTS], [...VARIANTS], [...VALUATION]]);
export const useRestockVariant = mutation(({ productId, id, data }: { productId: string; id: string; data: { qty: number; mode: string } }) => inventoryApi.restockVariant(productId, id, data), [[...PRODUCTS], [...VARIANTS], [...VALUATION]]);
export const useDeleteVariant = mutation(({ productId, id }: { productId: string; id: string }) => inventoryApi.deleteVariant(productId, id), [[...PRODUCTS], [...VARIANTS], [...VALUATION]]);

export const useCreateCategory = mutation((d: object) => inventoryApi.createCategory(d), [[...CATEGORIES], [...VALUATION]]);
export const useUpdateCategory = mutation(({ id, data }: { id: string; data: object }) => inventoryApi.updateCategory(id, data), [[...CATEGORIES], [...VALUATION]]);
export const useDeleteCategory = mutation((id: string) => inventoryApi.deleteCategory(id), [[...CATEGORIES], [...VALUATION]]);

export const useCreateBrand = mutation((d: object) => inventoryApi.createBrand(d), [[...BRANDS], [...VALUATION]]);
export const useUpdateBrand = mutation(({ id, data }: { id: string; data: object }) => inventoryApi.updateBrand(id, data), [[...BRANDS], [...VALUATION]]);
export const useDeleteBrand = mutation((id: string) => inventoryApi.deleteBrand(id), [[...BRANDS], [...VALUATION]]);

export const useCreateUnit = mutation((d: object) => inventoryApi.createUnit(d), [[...UNITS], [...VALUATION]]);
export const useUpdateUnit = mutation(({ id, data }: { id: string; data: object }) => inventoryApi.updateUnit(id, data), [[...UNITS], [...VALUATION]]);
export const useDeleteUnit = mutation((id: string) => inventoryApi.deleteUnit(id), [[...UNITS], [...VALUATION]]);

export const useCreateSupplier = mutation((d: object) => inventoryApi.createSupplier(d), [[...SUPPLIERS]]);
export const useUpdateSupplier = mutation(({ id, data }: { id: string; data: object }) => inventoryApi.updateSupplier(id, data), [[...SUPPLIERS]]);
export const useDeleteSupplier = mutation((id: string) => inventoryApi.deleteSupplier(id), [[...SUPPLIERS]]);

// ── Sales ────────────────────────────────────────────────────────────────────

const CUSTOMERS = ["sales", "customers"] as const;
const DEALS = ["sales", "deals"] as const;
const ORDERS = ["sales", "orders"] as const;
const RETURNS = ["sales", "returns"] as const;
const TARGETS = ["sales", "targets"] as const;

export const useCustomers = (page = 1, pageSize = 200, opts?: QueryOpts) =>
  useQ([...CUSTOMERS, page, pageSize], () => salesApi.listCustomers(page, pageSize), (r) => r.data, opts);

export const useDeals = (page = 1, pageSize = 100, stage?: string, opts?: QueryOpts) =>
  useQ([...DEALS, page, pageSize, stage ?? "all"], () => salesApi.listDeals(page, pageSize, stage), (r) => r.data, opts);

export const useOrders = (page = 1, pageSize = 100, status?: string, opts?: QueryOpts) =>
  useQ([...ORDERS, page, pageSize, status ?? "all"], () => salesApi.listOrders(page, pageSize, status), (r) => r.data, opts);

export const useReturns = (page = 1, pageSize = 100, status?: string, opts?: QueryOpts) =>
  useQ([...RETURNS, page, pageSize, status ?? "all"], () => salesApi.listReturns(page, pageSize, status), (r) => r.data, opts);

export const useTargets = (page = 1, pageSize = 100, period?: string, opts?: QueryOpts) =>
  useQ([...TARGETS, page, pageSize, period ?? "all"], () => salesApi.listTargets(page, pageSize, period), (r) => r.data, opts);

export const useCreateCustomer = mutation((d: object) => salesApi.createCustomer(d), [[...CUSTOMERS]]);
export const useUpdateCustomer = mutation(({ id, data }: { id: string; data: object }) => salesApi.updateCustomer(id, data), [[...CUSTOMERS]]);
export const useDeleteCustomer = mutation((id: string) => salesApi.deleteCustomer(id), [[...CUSTOMERS]]);

export const useCreateDeal = mutation((d: object) => salesApi.createDeal(d), [[...DEALS]]);
export const useUpdateDeal = mutation(({ id, data }: { id: string; data: object }) => salesApi.updateDeal(id, data), [[...DEALS]]);
export const useDeleteDeal = mutation((id: string) => salesApi.deleteDeal(id), [[...DEALS]]);

export const useCreateOrder = mutation((d: object) => salesApi.createOrder(d), [[...ORDERS], ["finance", "transactions"], ["finance", "reports"], [...PRODUCTS], [...VALUATION]]);
export const useUpdateOrder = mutation(({ id, data }: { id: string; data: object }) => salesApi.updateOrder(id, data), [[...ORDERS], ["finance", "transactions"], ["finance", "reports"]]);
export const useDeleteOrder = mutation((id: string) => salesApi.deleteOrder(id), [[...ORDERS], ["finance", "transactions"], ["finance", "reports"]]);

export const useCreateReturn = mutation((d: object) => salesApi.createReturn(d), [[...RETURNS], ["finance", "transactions"], ["finance", "reports"], [...PRODUCTS], [...VALUATION]]);
export const useUpdateReturn = mutation(({ id, data }: { id: string; data: object }) => salesApi.updateReturn(id, data), [[...RETURNS], ["finance", "transactions"], ["finance", "reports"]]);
export const useDeleteReturn = mutation((id: string) => salesApi.deleteReturn(id), [[...RETURNS], ["finance", "transactions"], ["finance", "reports"]]);

export const useCreateTarget = mutation((d: object) => salesApi.createTarget(d), [[...TARGETS]]);
export const useUpdateTarget = mutation(({ id, data }: { id: string; data: object }) => salesApi.updateTarget(id, data), [[...TARGETS]]);
export const useDeleteTarget = mutation((id: string) => salesApi.deleteTarget(id), [[...TARGETS]]);

// ── Finance ──────────────────────────────────────────────────────────────────

const REPORTS = ["finance", "reports"] as const;
const ACCOUNTS = ["finance", "accounts"] as const;
const EXPENSES = ["finance", "expenses"] as const;
const TRANSACTIONS = ["finance", "transactions"] as const;

export const useTrialBalance = (from?: string, to?: string, opts?: QueryOpts) =>
  useQ([...REPORTS, "trial-balance", from ?? "all", to ?? "all"], () => financeApi.trialBalance(from, to), (r) => r.data, opts);

export const useIncomeStatement = (from?: string, to?: string, opts?: QueryOpts) =>
  useQ([...REPORTS, "income-statement", from ?? "all", to ?? "all"], () => financeApi.incomeStatement(from, to), (r) => r.data, opts);

export const useBalanceSheet = (asOf?: string, opts?: QueryOpts) =>
  useQ([...REPORTS, "balance-sheet", asOf ?? "all"], () => financeApi.balanceSheet(asOf), (r) => r.data, opts);

export const useCashFlow = (from?: string, to?: string, opts?: QueryOpts) =>
  useQ([...REPORTS, "cash-flow", from ?? "all", to ?? "all"], () => financeApi.cashFlow(from, to), (r) => r.data, opts);

export const useGeneralLedger = (from?: string, to?: string, accountId?: string, opts?: QueryOpts) =>
  useQ([...REPORTS, "general-ledger", from ?? "all", to ?? "all", accountId ?? "all"], () => financeApi.generalLedger(from, to, accountId), (r) => r.data, opts);

export const useAccounts = (type?: string, opts?: QueryOpts) =>
  useQ([...ACCOUNTS, type ?? "all"], () => financeApi.listAccounts(type), (r) => r.data, opts);

export const useExpenses = (status?: string, opts?: QueryOpts) =>
  useQ([...EXPENSES, status ?? "all"], () => financeApi.listExpenses(status), (r) => r.data, opts);

export const useTransactions = (type?: string, status?: string, opts?: QueryOpts) =>
  useQ([...TRANSACTIONS, type ?? "all", status ?? "all"], () => financeApi.listTransactions(type, status), (r) => r.data, opts);

export const useCreateAccount = mutation((d: Parameters<typeof financeApi.createAccount>[0]) => financeApi.createAccount(d), [[...ACCOUNTS], [...REPORTS]]);
export const useUpdateAccount = mutation(({ id, data }: { id: string; data: Parameters<typeof financeApi.updateAccount>[1] }) => financeApi.updateAccount(id, data), [[...ACCOUNTS], [...REPORTS]]);
export const useDeleteAccount = mutation((id: string) => financeApi.deleteAccount(id), [[...ACCOUNTS], [...REPORTS]]);
export const useSeedAccounts = mutation(() => financeApi.seedAccounts(), [[...ACCOUNTS], [...REPORTS]]);

export const useCreateExpense = mutation((d: Parameters<typeof financeApi.createExpense>[0]) => financeApi.createExpense(d), [[...EXPENSES], [...REPORTS], [...TRANSACTIONS]]);
export const useApproveExpense = mutation((id: string) => financeApi.approveExpense(id), [[...EXPENSES], [...REPORTS], [...TRANSACTIONS]]);
export const useRejectExpense = mutation((id: string) => financeApi.rejectExpense(id), [[...EXPENSES], [...REPORTS], [...TRANSACTIONS]]);
export const useDeleteExpense = mutation((id: string) => financeApi.deleteExpense(id), [[...EXPENSES], [...REPORTS], [...TRANSACTIONS]]);

export const useCreateTransaction = mutation((d: Parameters<typeof financeApi.createTransaction>[0]) => financeApi.createTransaction(d), [[...TRANSACTIONS], [...REPORTS], [...ACCOUNTS], [...EXPENSES]]);
export const usePostTransaction = mutation((id: string) => financeApi.postTransaction(id), [[...TRANSACTIONS], [...REPORTS], [...ACCOUNTS], [...EXPENSES]]);
export const useVoidTransaction = mutation((id: string) => financeApi.voidTransaction(id), [[...TRANSACTIONS], [...REPORTS], [...ACCOUNTS], [...EXPENSES]]);
export const useBackfillSales = mutation(() => financeApi.backfillSales(), [[...TRANSACTIONS], [...REPORTS], [...ACCOUNTS], [...EXPENSES]]);

// ── HR ───────────────────────────────────────────────────────────────────────

const EMPLOYEES = ["hr", "employees"] as const;
const ATTENDANCE = ["hr", "attendance"] as const;
const LEAVE = ["hr", "leave"] as const;
const PAYROLL = ["hr", "payroll"] as const;
const APPLICANTS = ["hr", "applicants"] as const;
const DEPARTMENTS = ["hr", "departments"] as const;

export const useDepartments = (opts?: QueryOpts) =>
  useQ([...DEPARTMENTS], () => departmentsApi.list(), (r) => r.data, opts);

export const useEmployees = (status?: string, opts?: QueryOpts) =>
  useQ([...EMPLOYEES, status ?? "all"], () => hrApi.listEmployees(status), (r) => r.data, opts);

export const useAttendance = (status?: string, opts?: QueryOpts) =>
  useQ([...ATTENDANCE, status ?? "all"], () => hrApi.listAttendance(status), (r) => r.data, opts);

export const useLeave = (status?: string, opts?: QueryOpts) =>
  useQ([...LEAVE, status ?? "all"], () => hrApi.listLeave(status), (r) => r.data, opts);

export const usePayroll = (period?: string, status?: string, opts?: QueryOpts) =>
  useQ([...PAYROLL, period ?? "all", status ?? "all"], () => hrApi.listPayroll(period, status), (r) => r.data, opts);

export const useApplicants = (stage?: string, opts?: QueryOpts) =>
  useQ([...APPLICANTS, stage ?? "all"], () => hrApi.listApplicants(stage), (r) => r.data, opts);

export const useCreateEmployee = mutation((d: Parameters<typeof hrApi.createEmployee>[0]) => hrApi.createEmployee(d), [[...EMPLOYEES]]);
export const useUpdateEmployee = mutation(({ id, data }: { id: string; data: Parameters<typeof hrApi.updateEmployee>[1] }) => hrApi.updateEmployee(id, data), [[...EMPLOYEES]]);
export const useDeleteEmployee = mutation((id: string) => hrApi.deleteEmployee(id), [[...EMPLOYEES]]);

export const useCreateAttendance = mutation((d: Parameters<typeof hrApi.createAttendance>[0]) => hrApi.createAttendance(d), [[...ATTENDANCE]]);
export const useUpdateAttendance = mutation(({ id, data }: { id: string; data: Parameters<typeof hrApi.updateAttendance>[1] }) => hrApi.updateAttendance(id, data), [[...ATTENDANCE]]);
export const useDeleteAttendance = mutation((id: string) => hrApi.deleteAttendance(id), [[...ATTENDANCE]]);

export const useCreateLeave = mutation((d: Parameters<typeof hrApi.createLeave>[0]) => hrApi.createLeave(d), [[...LEAVE]]);
export const useApproveLeave = mutation((id: string) => hrApi.approveLeave(id), [[...LEAVE]]);
export const useRejectLeave = mutation((id: string) => hrApi.rejectLeave(id), [[...LEAVE]]);
export const useDeleteLeave = mutation((id: string) => hrApi.deleteLeave(id), [[...LEAVE]]);

export const useCreatePayroll = mutation((d: Parameters<typeof hrApi.createPayroll>[0]) => hrApi.createPayroll(d), [[...PAYROLL]]);
export const useMarkPaid = mutation((id: string) => hrApi.markPaid(id), [[...PAYROLL]]);
export const useDeletePayroll = mutation((id: string) => hrApi.deletePayroll(id), [[...PAYROLL]]);

export const useCreateApplicant = mutation((d: Parameters<typeof hrApi.createApplicant>[0]) => hrApi.createApplicant(d), [[...APPLICANTS]]);
export const useUpdateApplicant = mutation(({ id, data }: { id: string; data: Parameters<typeof hrApi.updateApplicant>[1] }) => hrApi.updateApplicant(id, data), [[...APPLICANTS]]);
export const useDeleteApplicant = mutation((id: string) => hrApi.deleteApplicant(id), [[...APPLICANTS]]);

// ── Procurement ──────────────────────────────────────────────────────────────

const PURCHASES = ["procurement", "purchase-orders"] as const;

export const usePurchaseOrders = (status?: string, page = 1, pageSize = 100, opts?: QueryOpts) =>
  useQ([...PURCHASES, status ?? "all", page, pageSize], () => procurementApi.listPurchaseOrders(status, page, pageSize), (r) => r.data, opts);

export const usePurchaseOrder = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...PURCHASES, id], () => procurementApi.getPurchaseOrder(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });

export const useCreatePurchaseOrder = mutation((d: PurchaseCreateInput) => procurementApi.createPurchaseOrder(d), [[...PURCHASES], [...PRODUCTS], [...VALUATION], ["finance", "transactions"], ["finance", "reports"]]);
export const useUpdatePurchaseOrder = mutation(({ id, data }: { id: string; data: object }) => procurementApi.updatePurchaseOrder(id, data), [[...PURCHASES]]);
export const useReceivePurchaseOrder = mutation((id: string) => procurementApi.receivePurchaseOrder(id), [[...PURCHASES], [...PRODUCTS], [...VALUATION], ["finance", "transactions"], ["finance", "reports"]]);
export const useCancelPurchaseOrder = mutation((id: string) => procurementApi.cancelPurchaseOrder(id), [[...PURCHASES]]);
export const useDeletePurchaseOrder = mutation((id: string) => procurementApi.deletePurchaseOrder(id), [[...PURCHASES], [...PRODUCTS], [...VALUATION]]);

// ── CRM ──────────────────────────────────────────────────────────────────────

const CAMPAIGNS = ["crm", "campaigns"] as const;
const EMAILS = ["crm", "emails"] as const;

export const useCampaigns = (page = 1, pageSize = 100, opts?: QueryOpts) =>
  useQ([...CAMPAIGNS, page, pageSize], () => crmApi.listCampaigns(page, pageSize), (r) => r.data, opts);

export const useEmails = (page = 1, pageSize = 100, opts?: QueryOpts) =>
  useQ([...EMAILS, page, pageSize], () => crmApi.listEmails(page, pageSize), (r) => r.data, opts);

export const useCreateCampaign = mutation((d: Parameters<typeof crmApi.createCampaign>[0]) => crmApi.createCampaign(d), [[...CAMPAIGNS]]);
export const useUpdateCampaign = mutation(({ id, data }: { id: string; data: Parameters<typeof crmApi.updateCampaign>[1] }) => crmApi.updateCampaign(id, data), [[...CAMPAIGNS]]);
export const useDeleteCampaign = mutation((id: string) => crmApi.deleteCampaign(id), [[...CAMPAIGNS]]);

export const useCreateEmail = mutation((d: Parameters<typeof crmApi.createEmail>[0]) => crmApi.createEmail(d), [[...EMAILS], [...CAMPAIGNS]]);
export const useDeleteEmail = mutation((id: string) => crmApi.deleteEmail(id), [[...EMAILS]]);

// ── Manufacturing ────────────────────────────────────────────────────────────

const PRODUCTION = ["manufacturing", "orders"] as const;

export const useProductionOrders = (page = 1, pageSize = 100, opts?: QueryOpts) =>
  useQ([...PRODUCTION, page, pageSize], () => manufacturingApi.listProductionOrders(page, pageSize), (r) => r.data, opts);

export const useCreateProductionOrder = mutation((d: Parameters<typeof manufacturingApi.createProductionOrder>[0]) => manufacturingApi.createProductionOrder(d), [[...PRODUCTION]]);
export const useUpdateProductionOrder = mutation(({ id, data }: { id: string; data: Parameters<typeof manufacturingApi.updateProductionOrder>[1] }) => manufacturingApi.updateProductionOrder(id, data), [[...PRODUCTION]]);
export const useCompleteProductionOrder = mutation((id: string) => manufacturingApi.completeProductionOrder(id), [[...PRODUCTION], [...PRODUCTS], [...VALUATION]]);
export const useDeleteProductionOrder = mutation((id: string) => manufacturingApi.deleteProductionOrder(id), [[...PRODUCTION]]);

// ── Admin ────────────────────────────────────────────────────────────────────

const ADMIN_STATS = ["admin", "stats"] as const;
const TENANTS = ["admin", "tenants"] as const;

export const useAdminStats = (opts?: QueryOpts) =>
  useQ([...ADMIN_STATS], () => adminApi.stats(), (r) => r.data, opts);

export const useUsers = (page = 1, pageSize = 50, opts?: QueryOpts) =>
  useQ(["admin", "users", page, pageSize], () => adminApi.listUsers(page, pageSize), (r) => r.data, opts);

export const useTenants = (page = 1, pageSize = 20, opts?: QueryOpts) =>
  useQ([...TENANTS, page, pageSize], () => adminApi.listTenants(page, pageSize), (r) => r.data, opts);

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

export const useCreateTenant = mutation((d: Parameters<typeof adminApi.createTenant>[0]) => adminApi.createTenant(d), [[...TENANTS], [...ADMIN_STATS]]);
export const useUpdateTenant = mutation(({ id, data }: { id: string; data: Parameters<typeof adminApi.updateTenant>[1] }) => adminApi.updateTenant(id, data), [[...TENANTS], [...ADMIN_STATS]]);
export const useSuspendTenant = mutation((id: string) => adminApi.suspendTenant(id), [[...TENANTS], [...ADMIN_STATS]]);
export const useActivateTenant = mutation((id: string) => adminApi.activateTenant(id), [[...TENANTS], [...ADMIN_STATS]]);
export const useDeleteTenant = mutation((id: string) => adminApi.deleteTenant(id), [[...TENANTS], [...ADMIN_STATS]]);
export const useInviteUser = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.inviteUser>[1] }) => adminApi.inviteUser(tenantId, data), [[...TENANTS]]);
export const useDeleteUser = mutation(({ tenantId, userId }: { tenantId: string; userId: string }) => adminApi.deleteUser(tenantId, userId), [[...TENANTS]]);

export const useCreateDepartment = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.createDepartment>[1] }) => adminApi.createDepartment(tenantId, data), [[...TENANTS]]);
export const useDeleteDepartment = mutation(({ tenantId, departmentId }: { tenantId: string; departmentId: string }) => adminApi.deleteDepartment(tenantId, departmentId), [[...TENANTS]]);

export const useCreateRole = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.createRole>[1] }) => adminApi.createRole(tenantId, data), [[...TENANTS]]);
export const useDeleteRole = mutation(({ tenantId, roleId }: { tenantId: string; roleId: string }) => adminApi.deleteRole(tenantId, roleId), [[...TENANTS]]);

export const useCreateBranch = mutation(({ tenantId, data }: { tenantId: string; data: Parameters<typeof adminApi.createBranch>[1] }) => adminApi.createBranch(tenantId, data), [[...TENANTS]]);
export const useDeleteBranch = mutation(({ tenantId, branchId }: { tenantId: string; branchId: string }) => adminApi.deleteBranch(tenantId, branchId), [[...TENANTS]]);

// ── Re-export the response types for convenience ────────────────────────────

export type {
  ApiProduct, ApiVariant, ApiVariantListItem, ApiCategory, ApiBrand, ApiUnit, ApiSupplier,
  InventoryValuationReport,
  ApiCustomer, ApiDeal, ApiOrder, ApiReturn, ApiTarget,
  TrialBalance, IncomeStatement, BalanceSheet, CashFlowStatement, GeneralLedger,
  FinanceAccount, FinanceExpense, FinanceTransaction,
  ApiDepartment, ApiEmployee, ApiAttendance, ApiLeave, ApiPayroll, ApiApplicant,
  AdminTenant, AdminTenantStats, AdminPlatformStats, AdminUser,
  AdminUserRow, AdminDepartment, AdminRole, AdminBranch,
  PurchaseOrder, PurchaseItem, PurchaseItemInput, PurchaseCreateInput,
  ApiCampaign, ApiEmailLog,
  ApiProductionOrder, ApiProductionItem,
};
