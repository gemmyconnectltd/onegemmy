"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, UserRound, X } from "lucide-react";
import type { ApiCustomer } from "@/lib/api";
import { useCreateCustomer } from "@/lib/api/hooks";
import { useCan } from "@/lib/can";

/** Who will owe the balance of a partial or credit sale, picked (or added) right in the checkout — no dialog, no going back
 *  to the cart. Adding needs only a name; the phone is what lets the business remind them later. */
export function DebtCustomer({ customers, customerId, customerName, owes, money, onChange }: {
  customers: ApiCustomer[]; customerId: string | null | undefined; customerName?: string; owes: number | null;
  money: (v: number) => string; onChange: (id: string, name: string) => void;
}) {
  const can = useCan();
  const create = useCreateCustomer();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const term = q.trim().toLowerCase();
  const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  const matches = useMemo(() => {
    if (!term) return [];
    return customers.filter((c) => c.name.toLowerCase().includes(term) || (digits(term) && digits(c.phone).includes(digits(term))) || (c.email ?? "").toLowerCase().includes(term)).slice(0, 6);
  }, [customers, term]);
  // A phone that already belongs to a customer means it's them: use that record instead of a duplicate.
  const samePhone = adding && digits(phone).length >= 6 ? customers.find((c) => digits(c.phone) === digits(phone)) : undefined;

  const pick = (c: { id: string; name: string }) => { onChange(c.id, c.name); setQ(""); setAdding(false); setPhone(""); setError(""); };
  const save = async () => {
    if (samePhone) { pick(samePhone); return; }
    setError("");
    try {
      const res = await create.mutateAsync({ name: q.trim(), phone: phone.trim() || null, customer_type: "individual", source: "pos", is_active: true });
      pick(res.data);
    } catch (e) { setError((e as { detail?: string })?.detail ?? "The customer couldn't be saved. Try again."); }
  };

  if (customerId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"><UserRound size={14} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">{customerName || "Selected customer"}</span>
          <span className="block text-[11px] text-muted">{owes ? <>Already owes <strong className="text-amber-700 dark:text-amber-300">{money(owes)}</strong></> : "Owes nothing yet"}</span>
        </span>
        <button type="button" onClick={() => onChange("", "")} className="shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:bg-surface">Change</button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input autoFocus aria-label="Customer who will owe the balance" value={q} onChange={(e) => { setQ(e.target.value); setAdding(false); }}
          placeholder="Search customer by name or phone"
          className="w-full rounded-lg border-2 border-amber-400 bg-card py-2 pl-8 pr-8 text-[13px] outline-none focus:border-amber-500" />
        {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setAdding(false); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"><X size={13} /></button>}
      </div>
      {term && !adding && (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {matches.map((c) => (
            <li key={c.id}><button type="button" onClick={() => pick(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface">
              <UserRound size={13} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{c.name}</span>{c.phone && <span className="block truncate text-[11px] text-muted">{c.phone}</span>}</span>
            </button></li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">No customer matches “{q.trim()}”.</li>}
          {can("contacts", "create") && (
            <li className="border-t border-border"><button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-accent hover:bg-surface">
              <Plus size={13} aria-hidden /> Add “{q.trim()}” as a new customer
            </button></li>
          )}
        </ul>
      )}
      {adding && (
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
          <p className="text-[12px] font-semibold text-foreground">New customer: {q.trim()}</p>
          <input autoFocus type="tel" aria-label="New customer phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (to remind them to pay)"
            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
          {samePhone && <p className="text-[11.5px] text-muted">That phone belongs to <strong className="text-foreground">{samePhone.name}</strong>.</p>}
          {error && <p role="alert" className="text-[11.5px] text-red-600">{error}</p>}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[12px] font-semibold text-muted hover:text-foreground">Cancel</button>
            <button type="button" disabled={create.isPending || q.trim().length < 2} onClick={() => void save()} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-2 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
              <Check size={13} aria-hidden />{create.isPending ? "Saving…" : samePhone ? `Use ${samePhone.name}` : "Save & select"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
