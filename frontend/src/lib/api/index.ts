// Core client
export {
  request,
  getStoredToken, setStoredToken,
  getStoredRefreshToken, setStoredRefreshToken,
  clearStoredTokens,
} from "./client";

// Shared response types
export type { PaginatedResponse, SingleResponse } from "./types";

// Auth
export type { ApiTokenUserInfo, ApiTokenResponse, ApiRegisterRequest } from "./auth";
export { authApi } from "./auth";

// Inventory
export type { ApiProduct, ApiVariant, ApiCategory, ApiBrand, ApiUnit, ApiSupplier } from "./inventory";
export { inventoryApi } from "./inventory";

// Sales
export type { ApiCustomer, ApiDeal, ApiOrderItem, ApiOrder, ApiReturnItem, ApiReturn, ApiTarget } from "./sales";
export { salesApi } from "./sales";
