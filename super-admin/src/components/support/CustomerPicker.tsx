"use client";

import { useId, useMemo, useState } from "react";
import { Mail, Phone, Search, X } from "lucide-react";
import { PLAN_COLORS } from "@/lib/support/logic";
import { useSupport } from "@/lib/support/store";
import type { Customer } from "@/lib/support/types";
import { Avatar } from "./Avatars";

/** Searchable customer selector. Once chosen it shows the contact details with a Change action. */
export function CustomerPicker({ value, onChange, error }: { value: Customer | null; onChange: (c: Customer | null) => void; error?: string }) {
  const { data } = useSupport();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.customers ?? []).filter((c) => !s || [c.businessName, c.contactName, c.email, c.country].some((x) => x.toLowerCase().includes(s))).slice(0, 8);
  }, [data, q]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 p-3">
        <Avatar name={value.businessName} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{value.businessName} <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-white" style={{ backgroundColor: PLAN_COLORS[value.plan] }}>{value.plan}</span></p>
          <p className="truncate text-[12px] text-muted">{value.contactName} · {value.country}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-foreground/80"><span className="inline-flex items-center gap-1"><Mail size={11} />{value.email}</span><span className="inline-flex items-center gap-1"><Phone size={11} />{value.phone}</span></p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-semibold hover:bg-card"><X size={12} /> Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2 focus-within:border-accent ${error ? "border-red-500" : "border-border"}`}>
        <Search size={14} className="text-muted" />
        <input
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label="Search customers" aria-invalid={!!error}
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && results[0] && open) { e.preventDefault(); onChange(results[0]); } }}
          placeholder="Search by business, contact or email" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70 sm:text-[13.5px]"
        />
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-red-600">{error}</p>}
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg">
          {results.length === 0 && <li className="px-3 py-3 text-[12.5px] text-muted">No customers match “{q}”.</li>}
          {results.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(c); setQ(""); setOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface">
                <Avatar name={c.businessName} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{c.businessName}</span><span className="block truncate text-[11.5px] text-muted">{c.contactName} · {c.email}</span></span>
                <span className="text-[11px] text-muted">{c.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
