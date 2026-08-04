"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History, Loader2, Search, ShoppingBasket, Sun, Moon, TrendingUp } from "lucide-react";

import { ProductCard } from "@/components/pos/ProductCard";
import type { Product, Variant } from "@/components/pos/types";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useProducts } from "@/lib/api/hooks";
import type { ApiProduct } from "@/lib/api";
import { useAppConfig } from "@/lib/appConfig";

function apiToProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category?.name ?? "Uncategorized",
    emoji: "📦",
    stock: p.stock,
    image_url: p.image_url,
    sku: p.sku,
    has_variants: p.has_variants && (p.variants?.length ?? 0) > 0,
    variants: (p.variants ?? []).map(
      (v): Variant => ({ id: v.id, sku: v.sku, attributes: v.attributes, price: v.price, stock: v.stock }),
    ),
  };
}

export default function MobileHomePage() {
  const { data, isLoading, isError, refetch } = useProducts(1, 500);
  const { theme, setTheme } = useAppConfig();
  const { cart, addToCart, addVariantToCart, heldOrders, currencySymbol, fmt, totalItems, total } = useMobilePos();

  const products = useMemo(() => (data?.items ?? []).filter((p) => p.is_active).map(apiToProduct), [data]);
  const categories = useMemo(() => ["All", ...new Set(products.map((p) => p.category))], [products]);

  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    });
  }, [products, category, search]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cartCount = totalItems;

  return (
    <div className="min-h-full flex flex-col pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold text-foreground leading-tight">Point of Sale</h1>
            <p className="text-[10px] text-muted flex items-center gap-1">
              <TrendingUp size={10} />
              {cartCount} in cart
            </p>
          </div>

          <Link
            href="/m/held"
            className="relative w-9 h-9 flex items-center justify-center border border-border rounded-xl text-foreground/70"
            aria-label="Held sales"
          >
            <History size={16} />
            {heldOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 bg-accent text-white text-[9px] font-bold flex items-center justify-center rounded-full">
                {heldOrders.length}
              </span>
            )}
          </Link>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-muted"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-border rounded-xl">
            <Search size={14} className="text-muted flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted/40 outline-none"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-1.5 px-4 pb-2.5 overflow-x-auto no-scrollbar">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                category === c
                  ? "bg-accent border-accent text-white"
                  : "border-border text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </header>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2.5 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-surface h-36" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-[13px] text-muted">Couldn&apos;t load products.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-accent text-white text-[12px] font-semibold"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBasket size={28} className="text-muted/40 mb-2" />
          <p className="text-[13px] text-muted">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 p-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              inCartQty={cart.find((i) => i.id === p.id)?.qty ?? 0}
              bumping={false}
              expanded={expanded.has(p.id)}
              currencySymbol={currencySymbol}
              fmt={fmt}
              onAdd={addToCart}
              onAddVariant={addVariantToCart}
              onToggle={toggleExpanded}
            />
          ))}
        </div>
      )}

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <Link
          href="/m/cart"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+56px)] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[406px] z-30"
        >
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-accent text-white shadow-lg shadow-accent/30">
            <span className="flex items-center gap-2 text-[13px] font-bold">
              <ShoppingBasket size={16} />
              {cartCount} item{cartCount !== 1 ? "s" : ""}
            </span>
            <span className="text-[13px] font-bold font-mono">{currencySymbol} {fmt(total)}</span>
          </div>
        </Link>
      )}

      {isLoading && <Loader2 className="hidden" />}
    </div>
  );
}
