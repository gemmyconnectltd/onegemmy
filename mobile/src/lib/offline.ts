// Offline support: IDB-backed caches + generic pending-ops queue.
// localStorage is no longer used for data — everything goes through IndexedDB
// so we can store large catalogs without the 5 MB quota limit.

import { getAll, replaceAll, getItem, put, del, clearStore } from "@/lib/db";
import type { ApiProduct, ApiCustomer, ApiSupplier, ApiOrder, FinanceExpense } from "@/lib/api";

// ── network error detection ────────────────────────────────────────────────

// A network failure throws a plain fetch/TypeError. Real backend errors throw
// `{ status, detail }`. Anything with a `status` is a real server response.
export function isNetworkError(err: unknown): boolean {
  return !(err && typeof err === "object" && "status" in (err as { status?: number }));
}

// ── pending ops queue (generic) ────────────────────────────────────────────

export type OpType = "create_order" | "create_expense" | "restock" | "create_customer";

export interface PendingOp {
  id: string;           // client-generated UUID
  type: OpType;
  queuedAt: string;     // ISO timestamp
  payload: Record<string, unknown>;
}

const PENDING_CHANGED_EVENT = "onegemmy:pending-changed";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

export async function getPendingOps(): Promise<PendingOp[]> {
  return getAll<PendingOp>("pendingOps");
}

export async function addPendingOp(op: PendingOp): Promise<void> {
  await put<PendingOp>("pendingOps", op);
  emit();
}

export async function removePendingOp(id: string): Promise<void> {
  await del("pendingOps", id);
  emit();
}

export async function clearPendingOps(): Promise<void> {
  await clearStore("pendingOps");
  emit();
}

export function subscribePendingChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PENDING_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PENDING_CHANGED_EVENT, listener);
}

// ── backwards-compat: pending orders (wraps generic queue) ────────────────

export interface PendingOrder {
  clientOrderId: string;
  queuedAt: string;
  payload: Record<string, unknown>;
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const ops = await getPendingOps();
  return ops
    .filter((o) => o.type === "create_order")
    .map((o) => ({
      clientOrderId: o.id,
      queuedAt: o.queuedAt,
      payload: o.payload,
    }));
}

export async function addPendingOrder(order: PendingOrder): Promise<void> {
  await addPendingOp({
    id: order.clientOrderId,
    type: "create_order",
    queuedAt: order.queuedAt,
    payload: order.payload,
  });
}

export async function removePendingOrder(clientOrderId: string): Promise<void> {
  await removePendingOp(clientOrderId);
}

// ── offline product catalog ────────────────────────────────────────────────

export async function cacheProducts(items: ApiProduct[]): Promise<void> {
  await replaceAll<ApiProduct>("products", items);
}

export async function getCachedProducts(): Promise<ApiProduct[]> {
  return getAll<ApiProduct>("products");
}

// ── offline customer catalog ───────────────────────────────────────────────

export async function cacheCustomers(items: ApiCustomer[]): Promise<void> {
  await replaceAll<ApiCustomer>("customers", items);
}

export async function getCachedCustomers(): Promise<ApiCustomer[]> {
  return getAll<ApiCustomer>("customers");
}

// ── offline supplier catalog ───────────────────────────────────────────────

export async function cacheSuppliers(items: ApiSupplier[]): Promise<void> {
  await replaceAll<ApiSupplier>("suppliers", items);
}

export async function getCachedSuppliers(): Promise<ApiSupplier[]> {
  return getAll<ApiSupplier>("suppliers");
}

// ── offline order cache ─────────────────────────────────────────────────

export async function cacheOrders(items: ApiOrder[]): Promise<void> {
  await replaceAll<ApiOrder>("orders", items);
}

export async function getCachedOrders(): Promise<ApiOrder[]> {
  return getAll<ApiOrder>("orders");
}

// ── offline expense cache ───────────────────────────────────────────────

export async function cacheExpenses(items: FinanceExpense[]): Promise<void> {
  await replaceAll<FinanceExpense>("expenses", items);
}

export async function getCachedExpenses(): Promise<FinanceExpense[]> {
  return getAll<FinanceExpense>("expenses");
}

// ── local stock decrement (optimistic, for POS offline mode) ──────────────

export async function decrementLocalStock(productId: string, qty: number): Promise<void> {
  const product = await getItem<ApiProduct>("products", productId);
  if (!product) return;
  await put<ApiProduct>("products", { ...product, stock: Math.max(0, (product.stock ?? 0) - qty) });
}
