// offlineSync.ts — query-cache hydration from IDB + pending-op drain.
//
// Call hydrateQueryCache() once at boot (in providers.tsx) to pre-fill
// TanStack Query's cache from IndexedDB so pages render instantly even
// before the first network response arrives.
//
// Call syncPendingOps() to drain the pending-ops queue when back online.

import { queryClient } from "@/lib/api/queryClient";
import {
  getCachedProducts,
  getCachedCustomers,
  getCachedSuppliers,
  getPendingOps,
  removePendingOp,
} from "@/lib/offline";
import { salesApi, inventoryApi, financeApi } from "@/lib/api";

// ── canonical query keys (must match hooks.ts) ────────────────────────────

export const QUERY_KEYS = {
  products:  ["inventory", "products", 1, 100] as const,
  customers: ["sales", "customers", 1, 200] as const,
  suppliers: ["inventory", "suppliers"] as const,
} as const;

// ── hydrate query cache from IDB ──────────────────────────────────────────

export async function hydrateQueryCache(): Promise<void> {
  try {
    const [products, customers, suppliers] = await Promise.all([
      getCachedProducts(),
      getCachedCustomers(),
      getCachedSuppliers(),
    ]);

    if (products.length > 0) {
      queryClient.setQueryData(QUERY_KEYS.products, {
        data: { items: products, total: products.length, page: 1, page_size: 100 },
      });
    }

    if (customers.length > 0) {
      queryClient.setQueryData(QUERY_KEYS.customers, {
        data: { items: customers, total: customers.length, page: 1, page_size: 200 },
      });
    }

    if (suppliers.length > 0) {
      queryClient.setQueryData(QUERY_KEYS.suppliers, {
        data: { items: suppliers, total: suppliers.length, page: 1, page_size: 100 },
      });
    }
  } catch {
    // IDB unavailable or empty — silently skip, network will fill the cache
  }
}

// ── sync pending ops ──────────────────────────────────────────────────────

export type SyncResult = { synced: number; failed: number; errors: string[] };

export async function syncPendingOps(): Promise<SyncResult> {
  const ops = await getPendingOps();
  if (ops.length === 0) return { synced: 0, failed: 0, errors: [] };

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const op of ops) {
    try {
      if (op.type === "create_order") {
        await salesApi.createOrder(op.payload);
        await queryClient.invalidateQueries({ queryKey: ["sales", "orders"] });
        await queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      } else if (op.type === "create_expense") {
        await financeApi.createExpense(op.payload as Parameters<typeof financeApi.createExpense>[0]);
        await queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] });
        await queryClient.invalidateQueries({ queryKey: ["finance", "reports"] });
      } else if (op.type === "restock") {
        const { id, data } = op.payload as { id: string; data: { qty: number; mode: string; reason?: string } };
        await inventoryApi.restockProduct(id, data);
        await queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      } else if (op.type === "create_customer") {
        await salesApi.createCustomer(op.payload);
        await queryClient.invalidateQueries({ queryKey: ["sales", "customers"] });
      }
      await removePendingOp(op.id);
      synced++;
    } catch (e) {
      failed++;
      errors.push((e as { detail?: string })?.detail ?? "Unknown error");
    }
  }

  return { synced, failed, errors };
}
