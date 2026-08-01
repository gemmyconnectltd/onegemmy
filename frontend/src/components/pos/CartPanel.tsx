import { FileText, Minus, Pause, Percent, Plus, ShoppingCart, Trash2, UserRound } from "lucide-react";

import { IconBadge, getProductIcon, productAccent } from "./icons";
import type { CartItem } from "./types";

interface CartPanelProps {
  cart: CartItem[];
  customerName: string;
  notes: string;
  currencySymbol: string;
  fmt: (v: number) => string;
  onCustomerChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onUpdateDiscount: (id: string, discount: number) => void;
  onRemoveItem: (id: string) => void;
  onClear: () => void;
  onHold: () => void;
}

export function CartPanel({
  cart, customerName, notes, currencySymbol, fmt,
  onCustomerChange, onNotesChange, onUpdateQty, onUpdateDiscount, onRemoveItem, onClear, onHold,
}: CartPanelProps) {
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
        <ShoppingCart size={14} className="text-accent" />
        <span className="font-bold text-[13px] text-foreground">Cart</span>
        {totalItems > 0 && (
          <span className="px-1.5 py-0.5 bg-accent text-white text-[10px] font-bold rounded-full">
            {totalItems}
          </span>
        )}
        {cart.length > 0 && (
          <button onClick={onClear} className="ml-auto text-[11px] text-muted hover:text-red-500 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Customer + Notes — always visible, compact */}
      <div className="px-3 py-2 border-b border-border flex gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent transition-colors">
          <UserRound size={11} className="text-muted flex-shrink-0" />
          <input
            value={customerName}
            onChange={(e) => onCustomerChange(e.target.value)}
            placeholder="Customer"
            className="flex-1 text-[12px] outline-none bg-transparent text-foreground placeholder:text-muted min-w-0"
          />
        </div>
        <div className="flex-1 flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent transition-colors">
          <FileText size={11} className="text-muted flex-shrink-0" />
          <input
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notes"
            className="flex-1 text-[12px] outline-none bg-transparent text-foreground placeholder:text-muted min-w-0"
          />
        </div>
      </div>

      {/* Items — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted gap-2">
            <ShoppingCart size={26} strokeWidth={1.2} />
            <p className="text-[12px]">Cart is empty</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map((item) => {
              const accent = productAccent(item.id);
              const lineTotal = item.price * item.qty - item.discount;
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
                      <p className="text-[10px] text-muted truncate">
                        {Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                    <p className="text-[11px] text-muted font-mono">{currencySymbol} {fmt(item.price)}</p>
                    {/* Discount */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <Percent size={9} className="text-muted/50" />
                      <input
                        type="number"
                        min={0}
                        value={item.discount || ""}
                        onChange={(e) => onUpdateDiscount(item.id, Number(e.target.value) || 0)}
                        placeholder="disc"
                        className="w-16 text-[11px] border border-border rounded px-1.5 py-0.5 outline-none focus:border-accent bg-transparent text-foreground font-mono"
                      />
                      {item.discount > 0 && (
                        <span className="text-[10px] text-emerald-600 font-medium">-{fmt(item.discount)}</span>
                      )}
                    </div>
                  </div>

                  {/* Right: total + qty controls */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[13px] font-bold text-accent font-mono">{currencySymbol} {fmt(lineTotal)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => onUpdateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-border hover:bg-surface active:scale-90 transition-all">
                        <Minus size={10} />
                      </button>
                      <span className="text-[13px] font-bold w-5 text-center tabular-nums">{item.qty}</span>
                      <button onClick={() => onUpdateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-border hover:bg-surface active:scale-90 transition-all">
                        <Plus size={10} />
                      </button>
                      <button onClick={() => onRemoveItem(item.id)} className="w-6 h-6 flex items-center justify-center text-muted hover:text-red-500 transition-colors">
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
          className="w-full py-1.5 border border-dashed border-border rounded-lg text-[11px] font-medium text-muted hover:text-foreground hover:border-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Pause size={11} /> Hold sale
        </button>
      </div>
    </div>
  );
}
