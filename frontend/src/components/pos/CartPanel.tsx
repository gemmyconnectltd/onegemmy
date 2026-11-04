"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Minus, Pause, Plus, ShoppingCart, Trash2, UserRound, Wallet } from "lucide-react";

import { Drawer } from "@/components/ui/Drawer";
import { QtyInput } from "./QtyInput";
import { IconBadge, getProductIcon, productAccent } from "./icons";
import { resolveUploadUrl } from "@/lib/api/client";
import type { CartItem } from "./types";
import type { ApiCustomer } from "@/lib/api";
import { useCreateCustomer, useCustomerDebtSnapshot } from "@/lib/api/hooks";
import { useCan } from "@/lib/can";
import { SaleDate } from "./SaleDate";

interface CartPanelProps {
  cart: CartItem[];
  customers: ApiCustomer[];
  customerId: string | null;
  customerName: string;
  notes: string;
  currencySymbol: string;
  fmt: (v: number) => string;
  onCustomerChange: (id: string, name: string) => void;
  saleAt: string | null;
  onSaleAtChange: (value: string | null) => void;
  onNotesChange: (v: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onUpdateDiscount: (id: string, discount: number) => void;
  onRemoveItem: (id: string) => void;
  onClear: () => void;
  onHold: () => void;
  /** Show a per-line "Received" input so cash can be recorded item-by-item. */
  showCashReceived?: boolean;
  onUpdateCashReceived?: (id: string, value: number) => void;
}

export function CartPanel({
  cart, customers, customerId, customerName, notes, currencySymbol, fmt,
  onCustomerChange, saleAt, onSaleAtChange, onNotesChange, onUpdateQty, onRemoveItem, onClear, onHold,
  showCashReceived, onUpdateCashReceived,
}: CartPanelProps) {
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  // ── customer picker ────────────────────────────────────────────────────────
  const [custOpen, setCustOpen] = useState(false);
  const [custQ, setCustQ] = useState("");
  const custRef = useRef<HTMLDivElement>(null);
  // Recording a new customer without leaving the till
  const can = useCan();
  const createCustomer = useCreateCustomer();
  const [adding, setAdding] = useState(false);
  const owes = Number(useCustomerDebtSnapshot(customerId, true).data?.summary.outstanding ?? 0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [newCust, setNewCust] = useState({ type: "individual", name: "", phone: "", email: "", tin: "" });
  const [custError, setCustError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCustomers = customers.filter((c) => {
    const q = custQ.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  }).slice(0, 30);

  const pickCustomer = (id: string, name: string) => {
    onCustomerChange(id, name);
    setCustOpen(false);
    setCustQ("");
    setAdding(false);
  };

  // The same phone or email is the same person: offer them instead of creating a second record.
  const phoneKey = newCust.phone.replace(/\s+/g, ""), emailKey = newCust.email.trim().toLowerCase();
  const duplicate = adding ? customers.find((c) => (phoneKey && (c.phone ?? "").replace(/\s+/g, "") === phoneKey) || (emailKey && (c.email ?? "").toLowerCase() === emailKey)) : undefined;
  const startAdding = () => { setNewCust({ type: "individual", name: custQ.trim(), phone: "", email: "", tin: "" }); setCustError(null); setAdding(true); setCustOpen(false); };
  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError(null);
    try {
      if (duplicate) { pickCustomer(duplicate.id, duplicate.name); return; }
      const res = await createCustomer.mutateAsync({ name: newCust.name.trim(), phone: newCust.phone.trim() || null, email: newCust.email.trim() || null, customer_type: newCust.type, tin: newCust.tin.trim(), is_active: true });
      pickCustomer(res.data.id, res.data.name);
    } catch (err) {
      setCustError((err as { detail?: string })?.detail ?? "The customer could not be saved. Try again.");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header: compact, one row */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <ShoppingCart size={15} className="text-accent" aria-hidden />
        <span className="text-[14px] font-bold text-foreground">Cart</span>
        {totalItems > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{totalItems}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={onHold} disabled={cart.length === 0} title="Park this sale and serve someone else" className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-40"><Pause size={12} aria-hidden /> Hold</button>
          <button type="button" onClick={onClear} disabled={cart.length === 0} className="rounded-md px-2 py-1 text-[12px] font-semibold text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40">Clear</button>
        </div>
      </div>

      {/* Customer + Notes — always visible, compact */}
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
        <div ref={custRef} className="relative">
          <div className="flex items-stretch gap-2">
            <button type="button" aria-haspopup="listbox" aria-expanded={custOpen} onClick={() => { setAdding(false); setCustOpen((v) => !v); }}
              className="flex h-10 lg:h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 text-left transition-colors hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${customerName ? "bg-accent/15 text-accent" : "bg-card text-muted"}`}><UserRound size={14} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase leading-none tracking-wider text-muted">Customer</span>
                <span className={`mt-0.5 block truncate text-[13px] font-semibold leading-tight ${customerName ? "text-foreground" : "text-foreground/80"}`}>{customerName || "Walk-in customer"}{owes > 0 && <span className="ml-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">Owes {currencySymbol} {fmt(owes)}</span>}</span>
              </span>
              <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden />
            </button>
            {can("contacts", "create") && <button type="button" onClick={() => { setNewCust({ type: "individual", name: "", phone: "", email: "", tin: "" }); setCustError(null); setAdding(true); setCustOpen(false); }} className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-accent"><Plus size={15} aria-hidden />New</button>}
          </div>
          {custOpen && !adding && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {<>
              <input
                autoFocus
                value={custQ}
                onChange={(e) => setCustQ(e.target.value)}
                placeholder="Search customers…"
                className="w-full text-[12px] px-3 py-2 border-b border-border outline-none bg-transparent placeholder:text-muted/60"
              />
              <div className="max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => pickCustomer("", "")}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface transition-colors text-left"
                >
                  <UserRound size={12} className="text-muted flex-shrink-0" />
                  <span className="text-[12px] font-medium text-foreground">Walk-in</span>
                  {!customerId && <Check size={12} className="ml-auto text-accent flex-shrink-0" />}
                </button>
                {filteredCustomers.length === 0 && (
                  <p className="px-3 py-3 text-[11px] text-muted text-center">No customers found</p>
                )}
                {can("contacts", "create") && (
                  <button type="button" onClick={startAdding} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-[12px] font-semibold text-accent hover:bg-surface">
                    <Plus size={12} className="flex-shrink-0" />{custQ.trim() ? `Add "${custQ.trim()}" as a new customer` : "New customer"}
                  </button>
                )}
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCustomer(c.id, c.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface transition-colors text-left"
                  >
                    <UserRound size={12} className="text-muted flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium text-foreground truncate">{c.name}</span>
                      {(c.email || c.phone) && (
                        <span className="block text-[10px] text-muted truncate">{c.email ?? c.phone}</span>
                      )}
                    </span>
                    {customerId === c.id && <Check size={12} className="ml-auto text-accent flex-shrink-0" />}
                  </button>
                ))}
              </div>
              </>}
            </div>
          )}
        </div>
        <div className="flex items-stretch gap-2">
          {can("orders", "approve") && <div className="min-w-0 flex-1"><SaleDate value={saleAt} onChange={onSaleAtChange} /></div>}
          <button type="button" aria-expanded={notesOpen || !!notes} onClick={() => setNotesOpen((v) => !v)} className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors ${notes ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"} ${can("orders", "approve") ? "" : "flex-1 justify-start"}`}><FileText size={13} aria-hidden />{notes ? "Note added" : "Add note"}</button>
        </div>
        {(notesOpen || !!notes) && (
          <input value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Note for this sale" aria-label="Sale notes" autoFocus={notesOpen && !notes}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted focus:border-accent" />
        )}
      </div>

      {/* Items — scrollable */}
      <div className="min-h-[9rem] flex-1 overflow-y-auto overscroll-contain">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-3 px-4 text-muted">
            <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
              <ShoppingCart size={24} strokeWidth={1.5} className="text-muted/60" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-foreground/70">Your cart is empty</p>
              <p className="mt-0.5 max-w-[16rem] text-[11px] text-muted">Choose products from the catalogue, or scan a barcode, and they will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map((item) => {
              const accent = productAccent(item.id);
              const lineTotal = item.price * item.qty - item.discount;
              const variant = item.variant_attributes && Object.keys(item.variant_attributes).length > 0 ? Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
              return (
                <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface/50">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveUploadUrl(item.image_url) ?? undefined} alt={item.name} className="h-9 w-9 flex-shrink-0 rounded-lg object-cover ring-1 ring-border" />
                  ) : (
                    <IconBadge Icon={getProductIcon({ emoji: item.emoji })} size={16} color={accent} className="h-9 w-9 flex-shrink-0" rounded="rounded-lg" />
                  )}
                  <div className="min-w-0 flex-1">
                    {/* Line 1: what it is and what it comes to */}
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 line-clamp-2 break-words text-[12.5px] font-semibold leading-tight text-foreground" title={item.name}>{item.name}</p>
                      <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-foreground">{currencySymbol} {fmt(lineTotal)}</span>
                    </div>
                    {/* Line 2: unit price, the stepper and remove */}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-mono text-[10.5px] text-muted">{currencySymbol} {fmt(item.price)}{variant ? ` · ${variant}` : ""}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="inline-flex h-7 items-center overflow-hidden rounded-lg border border-border bg-card">
                          <button aria-label={`Decrease quantity of ${item.name}`} onClick={() => onUpdateQty(item.id, -1)} className="flex h-7 w-7 items-center justify-center text-foreground/70 transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"><Minus size={12} /></button>
                          <QtyInput value={item.qty} onCommit={(n) => onUpdateQty(item.id, n - item.qty)} className="h-7 w-9 border-x border-border text-[13px] font-semibold" />
                          <button aria-label={`Increase quantity of ${item.name}`} onClick={() => onUpdateQty(item.id, 1)} className="flex h-7 w-7 items-center justify-center text-foreground/70 transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"><Plus size={12} /></button>
                        </div>
                        <button aria-label={`Remove ${item.name}`} onClick={() => onRemoveItem(item.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-accent"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {showCashReceived && onUpdateCashReceived && (
                      <div className="mt-1 flex w-fit items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 focus-within:ring-1 focus-within:ring-accent" title="Cash received for this item">
                        <Wallet size={10} className="flex-shrink-0 text-muted/60" />
                        <input type="number" min={0} value={item.cashReceived || ""} onChange={(e) => onUpdateCashReceived(item.id, Number(e.target.value) || 0)} placeholder="Received" className="w-16 bg-transparent font-mono text-[11px] text-foreground outline-none" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <Drawer open={adding} onClose={() => { if (!createCustomer.isPending) setAdding(false); }} side="center" size="md" title="New customer" description="Saved to Customers and selected for this sale. Your cart stays as it is.">
        <form onSubmit={saveCustomer} className="space-y-3 p-5">
                  <div role="group" aria-label="Customer type" className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1 text-[12px] font-semibold">
                    {([["individual", "Individual"], ["business", "Business"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={newCust.type === k} onClick={() => setNewCust({ ...newCust, type: k })} className={`rounded-md py-1.5 ${newCust.type === k ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{l}</button>)}
                  </div>
                  <input autoFocus required value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} placeholder={newCust.type === "business" ? "Business name" : "Name"} aria-label="Customer name" className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
                  <input type="tel" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} placeholder="Phone" aria-label="Customer phone" className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
                  <input type="email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} placeholder="Email (optional)" aria-label="Customer email" className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
                  <input required value={newCust.tin} onChange={(e) => setNewCust({ ...newCust, tin: e.target.value })} placeholder={newCust.type === "business" ? "Business TIN (required)" : "TIN (required)"} aria-label="TIN" inputMode="numeric" className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
                  {duplicate && <p role="status" className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11.5px] font-medium text-amber-800 dark:text-amber-300">{duplicate.name} already has this {phoneKey && (duplicate.phone ?? "").replace(/\s+/g, "") === phoneKey ? "phone number" : "email"}. Saving will select them instead of creating a duplicate.</p>}
                  {custError && <p role="alert" className="text-[11px] font-medium text-red-600">{custError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-border px-3 py-2.5 text-[13px] font-semibold text-foreground hover:bg-surface">Cancel</button>
                    <button type="submit" disabled={!newCust.name.trim() || newCust.tin.trim().length < 3 || createCustomer.isPending} className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 disabled:opacity-50">{createCustomer.isPending ? "Saving…" : duplicate ? "Use existing" : "Save & select"}</button>
                  </div>
                </form>
      </Drawer>
    </div>
  );
}
