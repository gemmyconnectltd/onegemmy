import { Minus, Pause, Plus, ShoppingCart, Trash2, UserRound } from "lucide-react";

import { IconBadge, getProductIcon, productAccent } from "./icons";
import type { CartItem } from "./types";

interface CartPanelProps {
  cart: CartItem[];
  customerName: string;
  currencySymbol: string;
  fmt: (v: number) => string;
  onCustomerChange: (v: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onClear: () => void;
  onHold: () => void;
}

export function CartPanel({
  cart, customerName, currencySymbol, fmt,
  onCustomerChange, onUpdateQty, onRemoveItem, onClear, onHold,
}: CartPanelProps) {
  return (
    <div className="w-full flex-1 min-h-0 bg-card border-t lg:border-t-0 lg:border-l border-border flex flex-col max-h-[55vh] lg:max-h-none">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 flex-shrink-0">
        <ShoppingCart size={16} className="text-accent" />
        <span className="font-bold text-[15px] text-foreground">Order</span>
        {cart.length > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-accent text-white text-[11px] font-bold rounded-full">
            {cart.reduce((s, i) => s + i.qty, 0)}
          </span>
        )}
        {cart.length > 0 && (
          <button onClick={onClear} className="ml-auto text-[12px] text-muted hover:text-foreground transition-colors">
            Clear
          </button>
        )}
      </div>

      <div className="px-4 pt-3 flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
          <UserRound size={14} className="text-muted flex-shrink-0" />
          <input
            value={customerName}
            onChange={(e) => onCustomerChange(e.target.value)}
            placeholder="Customer name (optional)"
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0 mt-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted gap-3 py-12">
            <ShoppingCart size={36} strokeWidth={1} />
            <p className="text-[14px]">No items yet</p>
            <p className="text-[12px] text-muted/60">Tap a product to start the sale</p>
          </div>
        ) : (
          cart.map((item) => {
            const accent = productAccent(item.id);
            return (
              <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                <IconBadge
                  Icon={getProductIcon({ ...item, category: "", stock: 99, emoji: item.emoji })}
                  size={18}
                  color={accent}
                  className="w-10 h-10"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{item.name}</p>
                  <p className="text-[12px] text-accent font-medium font-mono">
                    {currencySymbol} {fmt(item.price * item.qty)}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onUpdateQty(item.id, -1)}
                    aria-label={`Decrease ${item.name} quantity`}
                    className="w-7 h-7 flex items-center justify-center border border-border hover:bg-surface active:scale-90 transition-all rounded-full"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-[14px] font-bold w-6 text-center tabular-nums">{item.qty}</span>
                  <button
                    onClick={() => onUpdateQty(item.id, 1)}
                    aria-label={`Increase ${item.name} quantity`}
                    className="w-7 h-7 flex items-center justify-center border border-border hover:bg-surface active:scale-90 transition-all rounded-full"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-500 ml-0.5 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-4 space-y-3.5 flex-shrink-0">
        <button
          onClick={onHold}
          disabled={cart.length === 0}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border rounded-xl text-[12px] font-semibold text-muted hover:text-foreground hover:border-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Pause size={13} /> Hold this sale
        </button>
      </div>
    </div>
  );
}
