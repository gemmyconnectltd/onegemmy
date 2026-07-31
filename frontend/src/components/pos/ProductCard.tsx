import { AlertTriangle, ImageOff } from "lucide-react";

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
      className={`bg-card border-2 rounded-2xl text-left transition-all group relative overflow-hidden hover:shadow-md active:scale-[0.97] flex flex-col ${
        outOfStock
          ? "opacity-40 cursor-not-allowed border-border"
          : inCartQty > 0
          ? "border-accent shadow-sm"
          : "border-border hover:border-accent/40"
      } ${bumping ? "scale-[0.96]" : ""}`}
    >
      {/* Cart qty badge */}
      {inCartQty > 0 && (
        <span className="absolute top-2 right-2 z-10 w-6 h-6 bg-accent text-white text-[11px] font-bold flex items-center justify-center rounded-full shadow">
          {inCartQty}
        </span>
      )}

      {/* Image or icon */}
      <div className="w-full aspect-square relative overflow-hidden bg-surface flex items-center justify-center">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <IconBadge
            Icon={getProductIcon(product)}
            size={28}
            color={accent}
            className="w-16 h-16 transition-transform group-hover:scale-110"
          />
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-[10px] font-bold text-red-500 bg-white/90 px-2 py-0.5 rounded-full">Out of stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-0.5 flex-1">
        <p className="text-[12px] font-semibold text-foreground leading-tight line-clamp-2">{product.name}</p>
        {product.sku && (
          <p className="text-[10px] text-muted font-mono">{product.sku}</p>
        )}
        <p className="text-[13px] text-accent font-bold mt-1 font-mono">
          {currencySymbol} {fmt(product.price)}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[10px] text-muted truncate">{product.category}</p>
          {lowStock && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 flex-shrink-0">
              <AlertTriangle size={9} /> {product.stock}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
