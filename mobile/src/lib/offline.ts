// Offline support for the POS: a localStorage-backed product cache and a
// pending-sales queue. When the backend is unreachable, sales are stored here
// and replayed (with idempotent client_order_id) once the app is back online.

import type { ApiProduct } from "@/lib/api";

const PENDING_KEY = "onegemmy_pending_orders";
const PRODUCT_CACHE_KEY = "onegemmy_product_cache";
const PENDING_CHANGED_EVENT = "onegemmy:pending-changed";

export interface PendingOrder {
  clientOrderId: string;
  queuedAt: string;
  payload: Record<string, unknown>;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// A network failure throws a plain fetch/TypeError. Real backend errors throw
// `{ status, detail }`. Anything with a `status` is a real server response.
export function isNetworkError(err: unknown): boolean {
  return !(err && typeof err === "object" && "status" in (err as { status?: number }));
}

// ── pending sales queue ────────────────────────────────────────────────────

export function getPendingOrders(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  return safeParse<PendingOrder[]>(localStorage.getItem(PENDING_KEY)) ?? [];
}

export function addPendingOrder(order: PendingOrder): void {
  if (typeof window === "undefined") return;
  const orders = getPendingOrders();
  orders.push(order);
  localStorage.setItem(PENDING_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

export function removePendingOrder(clientOrderId: string): void {
  if (typeof window === "undefined") return;
  const orders = getPendingOrders().filter((o) => o.clientOrderId !== clientOrderId);
  localStorage.setItem(PENDING_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

export function subscribePendingChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PENDING_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PENDING_CHANGED_EVENT, listener);
}

// ── offline product catalog ────────────────────────────────────────────────

export function cacheProducts(items: ApiProduct[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
}

export function getCachedProducts(): ApiProduct[] | null {
  if (typeof window === "undefined") return null;
  const cached = safeParse<{ at: number; items: ApiProduct[] }>(localStorage.getItem(PRODUCT_CACHE_KEY));
  return cached?.items ?? null;
}
