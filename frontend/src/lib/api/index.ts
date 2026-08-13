// Core client
export {
  request,
  getStoredToken, setStoredToken,
  getStoredRefreshToken, setStoredRefreshToken,
  clearStoredTokens,
  clearApiCache,
  setSessionExpiredHandler,
} from "./client";

// Shared response types
export type { PaginatedResponse, SingleResponse } from "./types";

// Auth
export type { ApiTokenUserInfo, ApiTokenResponse, ApiRegisterRequest } from "./auth";
export { authApi } from "./auth";

// Inventory
export type { ApiProduct, ApiVariant, ApiVariantListItem, ApiCategory, ApiBrand, ApiUnit, ApiSupplier, InventoryValuationReport } from "./inventory";
export { inventoryApi } from "./inventory";

// Sales
export type { ApiCustomer, ApiDeal, ApiOrderItem, ApiOrder, ApiReturnItem, ApiReturn, ApiTarget } from "./sales";
export { salesApi } from "./sales";

// Finance
export type {
  TrialBalance, TrialBalanceLine,
  IncomeStatement, StatementLine,
  BalanceSheet, BalanceSheetSection,
  CashFlowStatement, CashFlowSection, CashFlowLine,
  GeneralLedger, LedgerEntry,
  FinanceAccount, FinanceExpense, FinanceTransaction, FinanceTransactionLine,
} from "./finance";
export { financeApi } from "./finance";

// Tax
export type {
  TaxConfig, TaxCalculation, TaxPayment,
  PAYEResult, VATResult, WithholdingResult, PensionResult,
  CorporateTaxResult, ConsumptionTaxResult, TaxSummary, RwandaTaxRates,
} from "./tax";
export { taxApi } from "./tax";

// HR
export type {
  ApiDepartment, ApiEmployee, EmployeeCreatePayload,
  ApiAttendance, AttendanceCreatePayload,
  ApiLeave, LeaveCreatePayload,
  ApiPayroll, PayrollCreatePayload,
  ApiApplicant, ApplicantCreatePayload,
} from "./hr";
export { hrApi, departmentsApi } from "./hr";

// Procurement
export type { PurchaseOrder, PurchaseItem, PurchaseItemInput, PurchaseCreateInput } from "./procurement";
export { procurementApi } from "./procurement";

// Repairs, Batches, Serials, Transfers & Warranty
export type { RepairJob, RepairJobPart, InventoryBatch, ApiSerial, ApiStockTransfer, ApiStockTransferItem, ApiBranch, ApiWarrantyClaim } from "./repairs";
export { repairsApi, batchesApi, serialsApi, transfersApi, branchesApi, warrantyApi } from "./repairs";

// Manufacturing
export type { ApiProductionOrder, ApiProductionItem } from "./manufacturing";
export { manufacturingApi } from "./manufacturing";

// Admin
export type {
  AdminTenant, AdminTenantStats, AdminPlatformStats, AdminUser,
  AdminUserRow, AdminDepartment, AdminRole, AdminBranch,
} from "./admin";
export { adminApi } from "./admin";

// Tenants (current company: profile, entitlements)
export type { TenantEntitlements } from "./tenants";
export { tenantsApi } from "./tenants";
