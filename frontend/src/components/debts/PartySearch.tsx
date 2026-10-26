"use client";

import { useEffect, useId, useState } from "react";
import { useCustomers, useSuppliers } from "@/lib/api/hooks";
import { Input } from "@/components/ui/Form";
import type { DebtKind } from "./types";

export interface Party { id: string; name: string }

/** The one customer / supplier picker for debts: a debounced, server-side type-ahead. */
export function PartySearch({ kind, value, onChange, label }: { kind: DebtKind; value: Party | null; onChange: (party: Party | null) => void; label?: string }) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setTerm(text.trim()), 300); return () => clearTimeout(timer); }, [text]);
  const enabled = open && !value;
  const customers = useCustomers(1, 8, term, undefined, { enabled: enabled && kind === "receivable" });
  const suppliers = useSuppliers(1, 8, term, { enabled: enabled && kind === "payable" });
  const query = kind === "receivable" ? customers : suppliers;
  const items = (query.data?.items ?? []).filter(item => (item as { is_active?: boolean }).is_active !== false);
  const name = kind === "receivable" ? "customer" : "supplier";
  return <div className="relative">
    <Input role="combobox" aria-expanded={open && !value} aria-controls={listId} aria-autocomplete="list" aria-label={label ?? `Search ${name}s`} autoComplete="off"
      placeholder={`Type to search ${name}s…`} value={text}
      onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
      onChange={event => { setText(event.target.value); if (value) onChange(null); setOpen(true); }} />
    {value && <p className="mt-1 text-[11px] text-accent">Selected: {value.name}</p>}
    {open && !value && <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
      {query.isFetching && !items.length ? <li className="px-3 py-2 text-xs text-muted">Searching…</li>
        : items.length ? items.map(item => <li key={item.id} role="option" aria-selected={false}>
          <button type="button" className="w-full px-3 py-2 text-left text-xs hover:bg-surface focus-visible:bg-surface"
            onMouseDown={event => event.preventDefault()} onClick={() => { onChange({ id: item.id, name: item.name }); setText(item.name); setOpen(false); }}>{item.name}</button></li>)
          : <li className="px-3 py-2 text-xs text-muted">{term ? `No ${name} matches “${term}”.` : `Start typing to find a ${name}.`}</li>}
    </ul>}
  </div>;
}
