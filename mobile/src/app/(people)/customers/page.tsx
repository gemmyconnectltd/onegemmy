"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search, UserRound, Users } from "lucide-react";

import { useCustomers } from "@/lib/api/hooks";

export default function MobileCustomersPage() {
  const customersQ = useCustomers(1, 200);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      (customersQ.data?.items ?? []).filter((c) => {
        const q = query.trim().toLowerCase();
        return !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
      }),
    [customersQ.data, query],
  );

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-8 h-8 flex items-center justify-center text-muted" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold text-foreground">Customers</h1>
            <p className="text-[11px] text-muted mt-0.5">{filtered.length} customers</p>
          </div>
          <Link
            href="/customers/new"
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
            placeholder="Search customers"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-3.5 py-3">
              <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-accent flex-shrink-0">
                <UserRound size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground truncate">{c.name}</p>
                <p className="text-[10px] text-muted mt-0.5">
                  {c.phone || "No phone"} · <span className="capitalize">{c.customer_type}</span>
                </p>
              </div>
              <span className="flex-shrink-0 text-[11px] text-muted">{c.email || ""}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <Users size={26} className="mx-auto text-muted/40 mb-2" />
              <p className="text-[12px] text-muted">No customers found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
