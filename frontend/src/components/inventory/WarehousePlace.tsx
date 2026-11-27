"use client";

import { useMemo } from "react";
import { useWarehouses } from "@/lib/api/hooks";

/** Where stock is, in words a person recognises: the branch first, then the warehouse in it ("Kigali · Back store").
 *  A warehouse no branch owns is "Shared". One helper so every inventory page names places the same way. */
export interface Place { branch: string; warehouse: string; shared: boolean }

export function useWarehousePlaces() {
  const warehouses = useWarehouses();
  return useMemo(() => {
    const byId = new Map((warehouses.data?.items ?? []).map((w) => [w.id, w]));
    const place = (id: string | null | undefined, fallbackName?: string | null): Place | null => {
      const w = id ? byId.get(id) : undefined;
      if (!w) return fallbackName ? { branch: "", warehouse: fallbackName, shared: false } : null;
      return { branch: w.branch_name ?? "Shared", warehouse: w.name, shared: !w.branch_id };
    };
    const label = (id: string | null | undefined, fallbackName?: string | null) => {
      const p = place(id, fallbackName);
      return !p ? "" : p.branch ? `${p.branch} · ${p.warehouse}` : p.warehouse;
    };
    // For warehouse filters: grouped by branch, branch-owned first, then shared, by name.
    const options = [...(warehouses.data?.items ?? [])]
      .sort((a, b) => Number(!a.branch_id) - Number(!b.branch_id) || (a.branch_name ?? "").localeCompare(b.branch_name ?? "") || a.name.localeCompare(b.name))
      .map((w) => ({ id: w.id, label: `${w.branch_name ?? "Shared"} · ${w.name}${w.is_active ? "" : " (closed)"}` }));
    return { place, label, options };
  }, [warehouses.data]);
}

/** The place cell of a table: branch on top, warehouse under it. */
export function WarehousePlace({ place }: { place: Place | null }) {
  if (!place) return <span className="text-muted">—</span>;
  if (!place.branch) return <span>{place.warehouse}</span>;
  return <span className="block min-w-0">
    <span className={`block font-medium ${place.shared ? "text-muted" : ""}`}>{place.branch}</span>
    <span className="block truncate text-xs text-muted">{place.warehouse}</span>
  </span>;
}
