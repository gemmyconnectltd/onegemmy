import { Pause, PlayCircle, Trash2 } from "lucide-react";

import type { HeldOrder } from "./types";

interface HeldSalesDrawerProps {
  orders: HeldOrder[];
  currencySymbol: string;
  fmt: (v: number) => string;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

export function HeldSalesDrawer({ orders, currencySymbol, fmt, onResume, onDelete }: HeldSalesDrawerProps) {
  return (
    <div className="border-t border-border bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
        <Pause size={12} /> Held sales
      </div>
      {orders.length === 0 ? (
        <p className="text-[13px] text-muted py-3">
          Nothing parked. Hold a sale from the cart to free up the till for the next customer.
        </p>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {orders.map((h) => {
            const heldTotal = h.cart.reduce((s, i) => s + i.price * i.qty, 0);
            return (
              <div key={h.id} className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{h.label}</p>
                  <p className="text-[11px] text-muted">
                    {h.cart.length} item{h.cart.length !== 1 ? "s" : ""} · {currencySymbol} {fmt(heldTotal)} · {h.time}
                  </p>
                </div>
                <button
                  onClick={() => onResume(h.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-accent text-white text-[12px] font-semibold rounded-lg hover:opacity-90 transition"
                >
                  <PlayCircle size={13} /> Resume
                </button>
                <button
                  onClick={() => onDelete(h.id)}
                  aria-label="Discard held sale"
                  className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
