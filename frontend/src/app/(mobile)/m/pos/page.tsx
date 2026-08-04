"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown, History, Loader2, Search, ShoppingBasket, SlidersHorizontal,
  Sun, Moon, TrendingUp, X, CheckCircle2, RotateCcw,
} from "lucide-react";

import { ProductCard } from "@/components/pos/ProductCard";
import type { Product, Variant } from "@/components/pos/types";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useProducts } from "@/lib/api/hooks";
import type { ApiProduct } from "@/lib/api";
import { useAppConfig } from "@/lib/appConfig";

type SortKey = "featured" | "price-asc" | "price-desc" | "name" | "low-stock";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "name", label: "Name A–Z" },
  { key: "low-stock", label: "Low stock first" },
];

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

export default function MobilePosPage() {
  const { data, isLoading, isError, refetch } = useProducts(1, 500);
  const { theme, setTheme } = useAppConfig();
  const { cart, addToCart, addVariantToCart, heldOrders, currencySymbol, fmt, totalItems, total } = useMobilePos();

  const products = useMemo(() => (data?.items ?? []).filter((p) => p.is_active).map(apiToProduct), [data]);
  const categories = useMemo(() => ["All", ...new Set(products.map((p) => p.category))], [products]);

  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cartBump, setCartBump] = useState(false);
  const prevTotal = useRef(total);

  useEffect(() => {
    if (total > prevTotal.current) setCartBump(true);
    prevTotal.current = total;
    if (!cartBump) return;
    const t = setTimeout(() => setCartBump(false), 260);
    return () => clearTimeout(t);
  }, [total, cartBump]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (inStockOnly && p.stock <= 0) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    });
    switch (sort) {
      case "price-asc": list = [...list].sort((a, b) => a.price - b.price); break;
      case "price-desc": list = [...list].sort((a, b) => b.price - a.price); break;
      case "name": list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      case "low-stock": list = [...list].sort((a, b) => a.stock - b.stock); break;
      default: break;
    }
    return list;
  }, [products, category, search, sort, inStockOnly]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilters = category !== "All" || inStockOnly || sort !== "featured" || search.trim() !== "";
  const clearFilters = () => {
    setCategory("All");
    setSearch("");
    setSort("featured");
    setInStockOnly(false);
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
              {cartCount} in cart · {filtered.length} products
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
              placeholder="Search products or scan SKU…"
              className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted/40 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className="text-muted flex-shrink-0">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-1.5 px-4 pb-2.5">
          <div className="relative flex-shrink-0">
            <SlidersHorizontal size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none pl-7 pr-6 py-1.5 rounded-full bg-surface border border-border text-[11px] font-semibold text-foreground outline-none"
              aria-label="Sort products"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <ArrowUpDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>

          <button
            onClick={() => setInStockOnly((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors ${
              inStockOnly
                ? "bg-accent border-accent text-white"
                : "border-border text-muted"
            }`}
          >
            <CheckCircle2 size={12} />
            In stock
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border text-muted text-[11px] font-semibold ml-auto"
            >
              <RotateCcw size={11} /> Clear
            </button>
          )}
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
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
          <ShoppingBasket size={28} className="text-muted/40 mb-2" />
          <p className="text-[13px] text-muted">
            {hasActiveFilters ? "No products match your filters" : "No products yet"}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-[12px] font-semibold"
            >
              Clear filters
            </button>
          )}
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
          <div
            className={`flex items-center justify-between px-4 py-3 rounded-2xl bg-accent text-white shadow-lg shadow-accent/30 transition-transform ${
              cartBump ? "scale-105" : "scale-100"
            }`}
          >
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
