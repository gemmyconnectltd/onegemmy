import { AlertTriangle, ChevronDown } from "lucide-react";

import { LOW_STOCK_THRESHOLD } from "./constants";
import { IconBadge, getProductIcon, productAccent } from "./icons";
import type { Product, Variant } from "./types";

interface ProductCardProps {
  product: Product;
  inCartQty: number;
  bumping: boolean;
  expanded: boolean;
  currencySymbol: string;
  fmt: (v: number) => string;
  onAdd: (p: Product) => void;
  onAddVariant: (p: Product, v: Variant) => void;
  onToggle: (id: string) => void;
}

function attrLabel(attrs: Record<string, string>) {
  const entries = Object.entries(attrs);
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
}

export function ProductCard({ product, inCartQty, bumping, expanded, currencySymbol, fmt, onAdd, onAddVariant, onToggle }: ProductCardProps) {
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= LOW_STOCK_THRESHOLD;
  const accent = productAccent(product.id);
  const isVariantGroup = product.has_variants && (product.variants?.length ?? 0) > 0;
  const disabled = outOfStock || isVariantGroup;

  return (
    <div
      className={`bg-card border-2 rounded-2xl text-left transition-all relative overflow-hidden flex flex-col ${
        disabled
          ? "opacity-40 border-border"
          : inCartQty > 0
          ? "border-accent shadow-sm"
          : "border-border hover:border-accent/40 hover:shadow-md"
      } ${bumping ? "scale-[0.96]" : ""}`}
    >
      {/* Cart qty badge */}
      {inCartQty > 0 && (
        <span className="absolute top-2 right-2 z-10 w-6 h-6 bg-accent text-white text-[11px] font-bold flex items-center justify-center rounded-full shadow">
          {inCartQty}
        </span>
      )}

      {/* Image or icon — acts as the add/toggle button */}
      <button
        type="button"
        onClick={() => (isVariantGroup ? onToggle(product.id) : onAdd(product))}
        disabled={outOfStock}
        className={`block w-full text-left group ${isVariantGroup ? "cursor-pointer" : "active:scale-[0.97] transition-transform"}`}
      >
        <div className="w-full aspect-square relative overflow-hidden flex items-center justify-center">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              className="w-full h-full relative flex items-center justify-center"
              style={{ background: `linear-gradient(145deg, ${accent}1F 0%, ${accent}08 60%, transparent 100%)` }}
            >
              <div
                className="absolute -top-5 -right-5 w-16 h-16 rounded-full"
                style={{ backgroundColor: `${accent}14` }}
              />
              <div
                className="absolute -bottom-6 -left-4 w-20 h-20 rounded-full"
                style={{ backgroundColor: `${accent}0F` }}
              />
              <div
                className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: `${accent}1A`, border: `1px solid ${accent}33` }}
              >
                <IconBadge
                  Icon={getProductIcon(product)}
                  size={24}
                  color={accent}
                  rounded="rounded-2xl"
                />
              </div>
            </div>
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
          {isVariantGroup ? (
            <p className="text-[10px] text-accent font-semibold flex items-center gap-0.5">
              {product.variants?.length} variants <ChevronDown size={10} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </p>
          ) : product.sku ? (
            <p className="text-[10px] text-muted font-mono truncate">{product.sku}</p>
          ) : null}
          <p className="text-[13px] text-accent font-bold mt-auto pt-1 font-mono">
            {currencySymbol} {fmt(product.price)}
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[10px] text-muted truncate">{product.category}</p>
            {lowStock && !isVariantGroup && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 flex-shrink-0">
                <AlertTriangle size={9} /> {product.stock}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Variant sub-grid */}
      {isVariantGroup && expanded && (
        <div className="border-t border-border p-2 space-y-1.5 bg-surface/40">
          {product.variants?.map((v) => {
            const variantOut = v.stock <= 0;
            return (
              <button
                key={v.id}
                type="button"
                disabled={variantOut}
                onClick={() => onAddVariant(product, v)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${
                  variantOut
                    ? "opacity-40 cursor-not-allowed"
                    : "bg-card border border-border hover:border-accent/50 active:scale-[0.98]"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-foreground truncate">{attrLabel(v.attributes)}</p>
                  {v.sku && <p className="text-[10px] text-muted font-mono truncate">{v.sku}</p>}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[12px] font-bold text-accent font-mono">{currencySymbol} {fmt(v.price)}</span>
                  <span className={`text-[10px] ${v.stock <= LOW_STOCK_THRESHOLD ? "text-amber-600 font-semibold" : "text-muted"}`}>{v.stock} left</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
