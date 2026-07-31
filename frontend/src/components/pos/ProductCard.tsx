import { AlertTriangle } from "lucide-react";

import { LOW_STOCK_THRESHOLD } from "./constants";
import { IconBadge, getProductIcon, productAccent } from "./icons";
import type { Product } from "./types";

interface ProductCardProps {
  product: Product;
  inCartQty: number;
  bumping: boolean;
  currencySymbol: string;
  fmt: (v: number) => string;
  onAdd: (p: Product) => void;
}

export function ProductCard({ product, inCartQty, bumping, currencySymbol, fmt, onAdd }: ProductCardProps) {
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= LOW_STOCK_THRESHOLD;
  const accent = productAccent(product.id);

  return (
    <button
      onClick={() => onAdd(product)}
      disabled={outOfStock}
      className={`bg-white border-2 rounded-2xl p-4 text-left transition-all group relative hover:shadow-md active:scale-[0.97] ${
        outOfStock
          ? "opacity-40 cursor-not-allowed"
          : inCartQty > 0
          ? "border-accent"
          : "border-border hover:border-accent/40"
      } ${bumping ? "scale-[0.96]" : ""}`}
    >
      {inCartQty > 0 && (
        <span className="absolute top-2 right-2 w-6 h-6 bg-accent text-white text-[11px] font-bold flex items-center justify-center rounded-full shadow-sm">
          {inCartQty}
        </span>
      )}
      <IconBadge Icon={getProductIcon(product)} size={22} color={accent} className="w-12 h-12 mb-3 transition-transform group-hover:scale-110" />
      <p className="text-[13px] font-semibold text-foreground leading-tight">{product.name}</p>
      <p className="text-[13px] text-accent font-bold mt-1.5 font-mono">
        {currencySymbol} {fmt(product.price)}
      </p>
      <div className="flex items-center justify-between mt-0.5">
        <p className="text-[11px] text-muted">{product.category}</p>
        {outOfStock ? (
          <span className="text-[10px] font-semibold text-red-500">Out of stock</span>
        ) : lowStock ? (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
            <AlertTriangle size={10} /> {product.stock} left
          </span>
        ) : null}
      </div>
    </button>
  );
}
