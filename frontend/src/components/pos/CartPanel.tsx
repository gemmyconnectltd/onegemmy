"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Minus, Pause, Percent, Plus, ShoppingCart, Trash2, UserRound, Wallet } from "lucide-react";

import { IconBadge, getProductIcon, productAccent } from "./icons";
import { resolveUploadUrl } from "@/lib/api/client";
import type { CartItem } from "./types";
import type { ApiCustomer } from "@/lib/api";

interface CartPanelProps {
  cart: CartItem[];
  customers: ApiCustomer[];
  customerId: string | null;
  customerName: string;
  notes: string;
  currencySymbol: string;
  fmt: (v: number) => string;
  onCustomerChange: (id: string, name: string) => void;
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
  onCustomerChange, onNotesChange, onUpdateQty, onUpdateDiscount, onRemoveItem, onClear, onHold,
  showCashReceived, onUpdateCashReceived,
}: CartPanelProps) {
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  // ── customer picker ────────────────────────────────────────────────────────
  const [custOpen, setCustOpen] = useState(false);
  const [custQ, setCustQ] = useState("");
  const custRef = useRef<HTMLDivElement>(null);

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
  };

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-2 flex-shrink-0">
        <ShoppingCart size={15} className="text-accent" />
        <span className="font-bold text-[14px] text-foreground">Cart</span>
        {totalItems > 0 && (
          <span className="px-2 py-0.5 bg-accent text-white text-[11px] font-bold rounded-full tabular-nums">
            {totalItems}
          </span>
        )}
        {cart.length > 0 && (
          <button onClick={onClear} className="ml-auto text-[12px] font-medium text-muted hover:text-red-500 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Customer + Notes — always visible, compact */}
      <div className="px-3.5 py-2.5 border-b border-border flex gap-2 flex-shrink-0">
        <div ref={custRef} className="flex-1 relative">
          <button
            type="button"
            onClick={() => setCustOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2 hover:border-accent/50 transition-colors text-left"
          >
            <UserRound size={12} className="text-muted flex-shrink-0" />
            <span className={`flex-1 text-[12px] font-medium truncate min-w-0 ${customerName ? "text-foreground" : "text-muted"}`}>
              {customerName || "Customer"}
            </span>
            <ChevronDown size={11} className="text-muted flex-shrink-0" />
          </button>
          {custOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
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
            </div>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
          <FileText size={12} className="text-muted flex-shrink-0" />
          <input
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notes"
            className="flex-1 text-[12px] font-medium outline-none bg-transparent text-foreground placeholder:text-muted placeholder:font-normal min-w-0"
          />
        </div>
      </div>

      {/* Items — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
            <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
              <ShoppingCart size={24} strokeWidth={1.5} className="text-muted/60" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-foreground/70">Cart is empty</p>
              <p className="text-[11px] text-muted mt-0.5">Tap a product to add it</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map((item) => {
              const accent = productAccent(item.id);
              const lineTotal = item.price * item.qty - item.discount;
              return (
                <div key={item.id} className="px-3.5 py-3 flex items-center gap-3 hover:bg-surface/40 transition-colors">
                  {/* Thumbnail */}
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveUploadUrl(item.image_url) ?? undefined} alt={item.name} className="w-11 h-11 rounded-xl object-cover flex-shrink-0 ring-1 ring-border" />
                  ) : (
                    <IconBadge Icon={getProductIcon({ emoji: item.emoji })} size={17} color={accent} className="w-11 h-11 flex-shrink-0" rounded="rounded-xl" />
                  )}

                  {/* Name + unit price */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2">{item.name}</p>
                    {item.variant_attributes && Object.keys(item.variant_attributes).length > 0 && (
                      <p className="text-[10px] text-muted truncate">
                        {Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                    <p className="text-[11px] text-muted font-mono mt-0.5">{currencySymbol} {fmt(item.price)} each</p>
                    {/* Discount */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <div className="flex items-center gap-1 bg-surface rounded-md px-1.5 py-0.5 focus-within:ring-1 focus-within:ring-accent">
                        <Percent size={9} className="text-muted/60 flex-shrink-0" />
                        <input
                          type="number"
                          min={0}
                          value={item.discount || ""}
                          onChange={(e) => onUpdateDiscount(item.id, Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-12 text-[11px] outline-none bg-transparent text-foreground font-mono"
                        />
                      </div>
                      {item.discount > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">-{fmt(item.discount)}</span>
                      )}
                      {showCashReceived && onUpdateCashReceived && (
                        <div className="flex items-center gap-1 bg-surface rounded-md px-1.5 py-0.5 focus-within:ring-1 focus-within:ring-accent" title="Cash received for this item">
                          <Wallet size={9} className="text-muted/60 flex-shrink-0" />
                          <input
                            type="number"
                            min={0}
                            value={item.cashReceived || ""}
                            onChange={(e) => onUpdateCashReceived(item.id, Number(e.target.value) || 0)}
                            placeholder="Received"
                            className="w-16 text-[11px] outline-none bg-transparent text-foreground font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: total + qty controls */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-[14px] font-bold text-foreground font-mono tabular-nums">{currencySymbol} {fmt(lineTotal)}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onUpdateQty(item.id, -1)} className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-foreground hover:bg-surface hover:border-accent/40 active:scale-90 transition-all">
                        <Minus size={13} />
                      </button>
                      <span className="text-[14px] font-bold w-6 text-center tabular-nums">{item.qty}</span>
                      <button onClick={() => onUpdateQty(item.id, 1)} className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-foreground hover:bg-surface hover:border-accent/40 active:scale-90 transition-all">
                        <Plus size={13} />
                      </button>
                      <button onClick={() => onRemoveItem(item.id)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-500/5 rounded-full transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hold */}
      <div className="px-3.5 py-2.5 border-t border-border flex-shrink-0">
        <button
          onClick={onHold}
          disabled={cart.length === 0}
          className="w-full py-2 border border-dashed border-border rounded-lg text-[12px] font-semibold text-muted hover:text-foreground hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Pause size={12} /> Hold sale
        </button>
      </div>
    </div>
  );
}
