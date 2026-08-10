"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search, Truck } from "lucide-react";

import { useSuppliers } from "@/lib/api/hooks";

export default function MobileSuppliersPage() {
  const suppliersQ = useSuppliers();
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      (suppliersQ.data?.items ?? []).filter((s) => {
        const q = query.trim().toLowerCase();
        return !q || s.name.toLowerCase().includes(q) || (s.phone ?? "").toLowerCase().includes(q);
      }),
    [suppliersQ.data, query],
  );

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-8 h-8 flex items-center justify-center text-muted" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold text-foreground">Suppliers</h1>
            <p className="text-[11px] text-muted mt-0.5">{filtered.length} suppliers</p>
          </div>
          <Link
            href="/suppliers/new"
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-accent text-white text-[12px] font-semibold active:opacity-80 transition-opacity"
          >
            <Plus size={14} /> Add
          </Link>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suppliers"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-3.5 py-3">
              <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-accent flex-shrink-0">
                <Truck size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground truncate">{s.name}</p>
                <p className="text-[10px] text-muted mt-0.5">{s.phone || "No phone"}</p>
              </div>
              {!s.is_active && <span className="flex-shrink-0 text-[10px] text-muted">Inactive</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <Truck size={26} className="mx-auto text-muted/40 mb-2" />
              <p className="text-[12px] text-muted">No suppliers found</p>
              <Link href="/purchase/new" className="mt-3 inline-block px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
                New purchase
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
