"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";

import { CartPanel } from "@/components/pos/CartPanel";
import { TAX_RATE, generateInvoiceId, generateOrderId, timeLabel } from "@/components/pos/constants";
import { POSHeader } from "@/components/pos/POSHeader";
import { PaymentPanel } from "@/components/pos/PaymentPanel";
import { ProductCard } from "@/components/pos/ProductCard";
import { Receipt } from "@/components/pos/Receipt";
import type { CartItem, HeldOrder, PaymentMethod, Product, SaleResult, Variant } from "@/components/pos/types";
import { Drawer } from "@/components/ui/Drawer";
import { useAppConfig } from "@/lib/appConfig";
import { saveSale } from "@/lib/invoices";
import { useProducts, useCustomers, useCreateOrder } from "@/lib/api/hooks";
import type { ApiProduct } from "@/lib/api";
import { usePageTitle } from "@/lib/pageTitles";

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
    variants: p.variants?.map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: v.attributes,
      price: v.price,
      stock: v.stock,
    })),
  };
}
export default function POSPage() {
  usePageTitle("Point of Sale");
  const { currencySymbol, locale, setLocale, locales, theme, setTheme } = useAppConfig();

  // ── inventory ────────────────────────────────────────────────────────────
  const { data: productData, isLoading, isError, refetch } = useProducts(1, 500);
  const loading = isLoading;
  const error = isError ? "Failed to load inventory. Check your connection." : null;
  const products = useMemo(
    () => (productData?.items ?? []).filter((p) => p.is_active).map(apiToProduct),
    [productData]
  );

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );

  const { data: customersData } = useCustomers(1, 500);
  const customers = customersData?.items ?? [];

  const createOrder = useCreateOrder();

  // ── ui state ─────────────────────────────────────────────────────────────
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [showLang, setShowLang] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  // ── cart ─────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [bumpId, setBumpId] = useState<string | null>(null);

  // ── held / session ───────────────────────────────────────────────────────
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  // ── keyboard shortcut: / → focus search ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── filtered products ────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.sku ?? "").toLowerCase().includes(search.toLowerCase()))
      ),
    [products, category, search]
  );

  // ── cart actions ─────────────────────────────────────────────────────────
  const addToCart = (p: Product) => {
    if (p.stock <= 0 || p.has_variants) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, product_id: p.id, variant_id: null, name: p.name, price: p.price, qty: 1, emoji: p.emoji, discount: 0, image_url: p.image_url, sku: p.sku, variant_attributes: null }];
    });
    setCashGiven("");
    setBumpId(p.id);
    window.setTimeout(() => setBumpId((c) => (c === p.id ? null : c)), 220);
  };

  const addVariantToCart = (p: Product, v: Variant) => {
    if (v.stock <= 0) return;
    const id = `${p.id}::${v.id}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) return prev.map((i) => i.id === id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, {
        id, product_id: p.id, variant_id: v.id, name: p.name, price: v.price,
        qty: 1, emoji: p.emoji, discount: 0, image_url: p.image_url,
        sku: v.sku ?? p.sku, variant_attributes: v.attributes,
      }];
    });
    setCashGiven("");
    setBumpId(id);
    window.setTimeout(() => setBumpId((c) => (c === id ? null : c)), 220);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter((i) => i.qty > 0)
    );
    setCashGiven("");
  };

  const updateDiscount = (id: string, discount: number) => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, discount: Math.max(0, discount) } : i));
    setCashGiven("");
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));

  const clearCart = () => {
    setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setNotes("");
    setCashGiven("");
    setSaleError(null);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || filtered.length === 0) return;
    addToCart(filtered[0]);
    setSearch("");
  };

  // ── totals ───────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = cart.reduce((s, i) => s + i.discount, 0);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * TAX_RATE);
  const total = taxable + tax;
  const change = cashGiven ? Math.max(0, Number(cashGiven) - total) : 0;
  const cashShort = payment === "cash" && cashGiven !== "" && Number(cashGiven) < total;
  const fmt = (v: number) => v.toLocaleString();

  // ── hold / resume ────────────────────────────────────────────────────────
  const holdSale = () => {
    if (cart.length === 0) return;
    setHeldOrders((prev) => [
      { id: `H-${Date.now()}`, label: customerName.trim() || `Parked ${timeLabel()}`, time: timeLabel(), cart, customerName, notes },
      ...prev,
    ]);
    clearCart();
  };

  const resumeHeld = (id: string) => {
    const held = heldOrders.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart);
    setCustomerId(null);
    setCustomerName(held.customerName);
    setNotes(held.notes);
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
    setShowHeld(false);
  };

  const deleteHeld = (id: string) => setHeldOrders((prev) => prev.filter((h) => h.id !== id));

  // ── complete sale ────────────────────────────────────────────────────────
  const completeSale = async () => {
    if (saving || cart.length === 0) return;
    setSaving(true);
    setSaleError(null);
    const isInvoice = payment === "invoice";
    try {
      // order-level discount is 0 — item discounts are already baked into each line_total
      await createOrder.mutateAsync({
        status: "Completed",
        customer_id: customerId,
        notes: `POS — ${payment}${customerName.trim() ? ` — ${customerName.trim()}` : ""}${notes.trim() ? ` | ${notes.trim()}` : ""}`,
        discount: 0,
        tax,
        items: cart.map((i) => ({
          product_id: i.product_id ?? null,
          variant_id: i.variant_id ?? null,
          product_name: i.name,
          sku: i.sku ?? null,
          variant_attributes: i.variant_attributes ?? null,
          unit_price: i.price,
          quantity: i.qty,
          discount: i.discount,
          line_total: i.price * i.qty - i.discount,
        })),
      });

      const sale: SaleResult = {
        orderId: generateOrderId(),
        invoiceNumber: isInvoice ? generateInvoiceId() : null,
        isInvoice,
        payment,
        customerName: customerName.trim(),
        notes: notes.trim(),
        items: cart,
        subtotal,
        discount,
        tax,
        total,
        cashGiven,
        change,
        timestamp: new Date(),
      };
      setCompletedSale(sale);
      saveSale(sale);
      setTodayCount((c) => c + 1);
      setTodayRevenue((r) => r + total);
      clearCart();
    } catch (e: unknown) {
      setSaleError(
        (e as { detail?: string })?.detail ??
          "Could not save the sale. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const startNewSale = () => {
    clearCart();
    setCompletedSale(null);
    setPayment("cash");
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Receipt modal */}
      <Drawer open={!!completedSale} onClose={startNewSale} side="center" size="md">
        {completedSale && (
          <Receipt sale={completedSale} currencySymbol={currencySymbol} fmt={fmt} onNewSale={startNewSale} />
        )}
      </Drawer>

      {/* Header */}
      <POSHeader
        heldCount={heldOrders.length}
        heldOrders={heldOrders}
        showHeld={showHeld}
        todayCount={todayCount}
        todayRevenue={todayRevenue}
        locale={locale}
        locales={locales}
        currencySymbol={currencySymbol}
        fmt={fmt}
        theme={theme}
        onToggleHeld={() => setShowHeld((v) => !v)}
        onResumeHeld={resumeHeld}
        onDeleteHeld={deleteHeld}
        onToggleLang={() => setShowLang((v) => !v)}
        showLang={showLang}
        onSetLocale={(c) => setLocale(c)}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />

      {/* Body */}
      <div className="flex-1 flex overflow-hidden flex-col lg:flex-row min-h-0">

        {/* ── Left: catalog ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Status bar */}
          <div className="flex items-center gap-2 px-4 pt-3 flex-shrink-0">
            {loading ? (
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <Loader2 size={11} className="animate-spin" /> Loading products…
              </span>
            ) : error ? (
              <span className="flex items-center gap-2 text-[11px] text-red-500">
                {error}
                <button onClick={() => refetch()} className="flex items-center gap-1 underline">
                  <RefreshCw size={11} /> Retry
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {products.length} products loaded
                <button onClick={() => refetch()} className="ml-1 text-muted hover:text-foreground">
                  <RefreshCw size={11} />
                </button>
              </span>
            )}
          </div>

          {/* Search */}
          <div className="px-4 pt-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5 focus-within:border-accent transition-colors">
              <Search size={14} className="text-muted flex-shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by name or SKU… (press / or Enter to add top match)"
                className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted hover:text-foreground transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto px-4 pt-2 flex-shrink-0">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap rounded-full transition-all flex-shrink-0 ${
                  category === c
                    ? "bg-accent text-white shadow-sm"
                    : "bg-card border border-border text-foreground/60 hover:text-foreground hover:border-accent/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 min-h-0">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl animate-pulse aspect-[3/4]" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-2 py-16">
                <Search size={28} strokeWidth={1.5} />
                <p className="text-[13px]">
                  {search ? `No results for "${search}"` : "No products in this category"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {filtered.map((p) => {
                  const inCart = cart.find((i) => i.id === p.id);
                  return (
                    <ProductCard
                      key={p.id}
                      product={p}
                      inCartQty={inCart?.qty ?? 0}
                      bumping={bumpId === p.id}
                      expanded={expanded.has(p.id)}
                      currencySymbol={currencySymbol}
                      fmt={fmt}
                      onAdd={addToCart}
                      onAddVariant={addVariantToCart}
                      onToggle={toggleExpanded}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: cart + payment */}
        <div className="w-full lg:w-[360px] flex-shrink-0 bg-card border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden">
          {/* Cart — flex-1 so it fills space and scrolls its own items */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CartPanel
              cart={cart}
              customers={customers}
              customerId={customerId}
              customerName={customerName}
              notes={notes}
              currencySymbol={currencySymbol}
              fmt={fmt}
              onCustomerChange={(id, name) => { setCustomerId(id || null); setCustomerName(name); }}
              onNotesChange={setNotes}
              onUpdateQty={updateQty}
              onUpdateDiscount={updateDiscount}
              onRemoveItem={removeItem}
              onClear={clearCart}
              onHold={holdSale}
            />
          </div>
          {/* Payment — never grows, scrolls its own content if needed */}
          <div className="flex-shrink-0 border-t border-border overflow-y-auto max-h-[52vh] lg:max-h-[48vh]">
            <div className="p-3">
              <PaymentPanel
                payment={payment}
                cashGiven={cashGiven}
                subtotal={subtotal}
                discount={discount}
                tax={tax}
                total={total}
                change={change}
                cashShort={cashShort}
                cartCount={cart.length}
                hasCustomer={customerName.trim().length > 0}
                currencySymbol={currencySymbol}
                fmt={fmt}
                saving={saving}
                saleError={saleError}
                onPaymentChange={(m) => { setPayment(m); setCashGiven(""); }}
                onCashChange={setCashGiven}
                onCharge={completeSale}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
