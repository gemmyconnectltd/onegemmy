"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Minus, Pause, Percent, Plus, ShoppingCart, Trash2, UserRound } from "lucide-react";

import { DISCOUNT_PRESETS } from "./constants";
import { IconBadge, getProductIcon, productAccent } from "./icons";
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
}

export function CartPanel({
  cart, customers, customerId, customerName, notes, currencySymbol, fmt,
  onCustomerChange, onNotesChange, onUpdateQty, onUpdateDiscount, onRemoveItem, onClear, onHold,
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
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <ShoppingCart size={13} />
        </div>
        <div className="leading-tight">
          <span className="font-bold text-[13px] text-foreground block">Current order</span>
          <span className="text-[10px] text-muted-foreground">
            {totalItems > 0 ? `${totalItems} item${totalItems !== 1 ? "s" : ""}` : "Empty cart"}
          </span>
        </div>
        {cart.length > 0 && (
          <button onClick={onClear} className="ml-auto text-[11px] text-muted-foreground hover:text-red-500 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Customer + Notes — always visible, compact */}
      <div className="px-3 py-2 border-b border-border flex gap-2 flex-shrink-0">
        <div ref={custRef} className="flex-1 relative">
          <button
            type="button"
            onClick={() => setCustOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1.5 hover:border-primary/50 transition-colors text-left"
          >
            <UserRound size={11} className="text-muted-foreground flex-shrink-0" />
            <span className={`flex-1 text-[12px] truncate min-w-0 ${customerName ? "text-foreground" : "text-muted-foreground"}`}>
              {customerName || "Customer"}
            </span>
            <ChevronDown size={11} className="text-muted-foreground flex-shrink-0" />
          </button>
          {custOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              <input
                autoFocus
                value={custQ}
                onChange={(e) => setCustQ(e.target.value)}
                placeholder="Search customers…"
                className="w-full text-[12px] px-3 py-2 border-b border-border outline-none bg-transparent placeholder:text-muted-foreground/60"
              />
              <div className="max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => pickCustomer("", "")}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                >
                  <UserRound size={12} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-[12px] font-medium text-foreground">Walk-in</span>
                  {!customerId && <Check size={12} className="ml-auto text-primary flex-shrink-0" />}
                </button>
                {filteredCustomers.length === 0 && (
                  <p className="px-3 py-3 text-[11px] text-muted-foreground text-center">No customers found</p>
                )}
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCustomer(c.id, c.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                  >
                    <UserRound size={12} className="text-muted-foreground flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium text-foreground truncate">{c.name}</span>
                      {(c.email || c.phone) && (
                        <span className="block text-[10px] text-muted-foreground truncate">{c.email ?? c.phone}</span>
                      )}
                    </span>
                    {customerId === c.id && <Check size={12} className="ml-auto text-primary flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1.5 focus-within:border-primary transition-colors">
          <FileText size={11} className="text-muted-foreground flex-shrink-0" />
          <input
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notes"
            className="flex-1 text-[12px] outline-none bg-transparent text-foreground placeholder:text-muted-foreground min-w-0"
          />
        </div>
      </div>

      {/* Items — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <ShoppingCart size={26} strokeWidth={1.2} />
            <p className="text-[12px]">Cart is empty</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map((item) => {
              const accent = productAccent(item.id);
              const lineTotal = item.price * item.qty - item.discount;
              const lineGross = item.price * item.qty;
              const activePct = item.discount > 0
                ? Math.round((item.discount / Math.max(1, lineGross)) * 100)
                : 0;
              return (
                <div key={item.id} className="px-3 py-2.5 flex items-center gap-2.5">
                  {/* Thumbnail */}
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt={item.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <IconBadge Icon={getProductIcon({ emoji: item.emoji })} size={15} color={accent} className="w-9 h-9 flex-shrink-0" />
                  )}

                  {/* Name + unit price */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate">{item.name}</p>
                    {item.variant_attributes && Object.keys(item.variant_attributes).length > 0 && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground font-mono">{currencySymbol} {fmt(item.price)}</p>

                    {/* Discount: % presets + absolute input */}
                    <div className="flex items-center gap-1 mt-1">
                      <Percent size={9} className="text-muted-foreground/60 flex-shrink-0" />
                      <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                        {DISCOUNT_PRESETS.map((pct) => {
                          const active = activePct === pct;
                          const amount = Math.round((lineGross * pct) / 100);
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => onUpdateDiscount(item.id, active ? 0 : amount)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-surface border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                              }`}
                            >
                              {pct}%
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={item.discount || ""}
                        onChange={(e) => onUpdateDiscount(item.id, Math.max(0, Number(e.target.value) || 0))}
                        placeholder="disc"
                        aria-label="Discount amount"
                        className="w-14 text-[11px] border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary bg-transparent text-foreground font-mono"
                      />
                      {item.discount > 0 && (
                        <span className="text-[10px] text-emerald-600 font-medium flex-shrink-0">-{fmt(item.discount)}</span>
                      )}
                    </div>
                  </div>

                  {/* Right: total + qty controls */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[13px] font-bold text-primary font-mono">{currencySymbol} {fmt(lineTotal)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => onUpdateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-border hover:bg-surface active:scale-90 transition-all">
                        <Minus size={10} />
                      </button>
                      <span className="text-[13px] font-bold w-5 text-center tabular-nums">{item.qty}</span>
                      <button onClick={() => onUpdateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-border hover:bg-surface active:scale-90 transition-all">
                        <Plus size={10} />
                      </button>
                      <button onClick={() => onRemoveItem(item.id)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash2 size={11} />
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
      <div className="px-3 py-2 border-t border-border flex-shrink-0">
        <button
          onClick={onHold}
          disabled={cart.length === 0}
          className="w-full py-1.5 border border-dashed border-border rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Pause size={11} /> Hold sale
        </button>
      </div>
    </div>
  );
}
