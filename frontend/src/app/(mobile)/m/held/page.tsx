"use client";

import { History, ShoppingBasket } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";

export default function MobileHeldPage() {
  const { heldOrders, currencySymbol, fmt, resumeHeld, deleteHeld } = useMobilePos();

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Held sales</h1>
        <p className="text-[11px] text-muted mt-0.5">
          {heldOrders.length} parked order{heldOrders.length !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="flex-1 px-3 py-2">
        {heldOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <History size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No held sales</p>
            <p className="text-[11px] text-muted/70 mt-1">Park a sale from the cart to resume it here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {heldOrders.map((held) => {
              const total = held.cart.reduce((s, i) => s + i.price * i.qty, 0);
              const items = held.cart.reduce((n, i) => n + i.qty, 0);
              return (
                <div key={held.id} className="bg-card border border-border rounded-xl px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{held.label}</p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {items} item{items !== 1 ? "s" : ""} · {held.time}
                      </p>
                    </div>
                    <span className="text-[14px] font-bold font-mono text-foreground flex-shrink-0">
                      {currencySymbol} {fmt(total)}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => resumeHeld(held.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent text-white text-[12px] font-bold active:scale-[0.98] transition"
                    >
                      <ShoppingBasket size={13} /> Resume
                    </button>
                    <button
                      onClick={() => deleteHeld(held.id)}
                      className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold active:scale-[0.98] transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
