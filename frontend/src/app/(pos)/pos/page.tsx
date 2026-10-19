"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import { CartPanel } from "@/components/pos/CartPanel";
import { TAX_RATE, timeLabel } from "@/components/pos/constants";
import { POSHeader } from "@/components/pos/POSHeader";
import { PaymentPanel } from "@/components/pos/PaymentPanel";
import { ProductCard } from "@/components/pos/ProductCard";
import { Receipt } from "@/components/pos/Receipt";
import type { CartItem, HeldOrder, PaymentMethod, Product, SaleResult, Variant } from "@/components/pos/types";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAppConfig } from "@/lib/appConfig";
import { orderToSale } from "@/lib/orders";
import { useAuth } from "@/lib/auth";
import { saveSale } from "@/lib/invoices";
import { useProducts, useCustomers, useCreateOrder, useCurrentTenant } from "@/lib/api/hooks";
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
    barcode: p.barcode,
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
  const { currencySymbol, locale, setLocale, locales, theme, setTheme, vatEnabled } = useAppConfig();
  const { data: tenant } = useCurrentTenant();

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
  const saleInFlight = useRef(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { user } = useAuth();
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
  const [dueDate, setDueDate] = useState("");
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
            (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (p.barcode ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (p.variants ?? []).some(variant => (variant.sku ?? "").toLowerCase().includes(search.toLowerCase())))
      ),
    [products, category, search]
  );

  // ── cart actions ─────────────────────────────────────────────────────────
  const addToCart = (p: Product) => {
    if (saleInFlight.current || p.stock <= 0 || p.has_variants) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => i.id === p.id ? { ...i, qty: Math.min(p.stock, i.qty + 1) } : i);
      return [...prev, { id: p.id, product_id: p.id, variant_id: null, name: p.name, price: p.price, qty: 1, emoji: p.emoji, discount: 0, image_url: p.image_url, sku: p.sku, variant_attributes: null }];
    });
    setCashGiven("");
    setBumpId(p.id);
    window.setTimeout(() => setBumpId((c) => (c === p.id ? null : c)), 220);
  };

  const addVariantToCart = (p: Product, v: Variant) => {
    if (saleInFlight.current || v.stock <= 0) return;
    const id = `${p.id}::${v.id}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) return prev.map((i) => i.id === id ? { ...i, qty: Math.min(v.stock, i.qty + 1) } : i);
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
    if (saleInFlight.current) return;
    const line = cart.find(item => item.id === id);
    const product = products.find(product => product.id === line?.product_id);
    const stock = line?.variant_id ? product?.variants?.find(variant => variant.id === line.variant_id)?.stock : product?.stock;
    setCart((prev) =>
      prev.map((i) => i.id === id ? { ...i, qty: Math.min(stock ?? Infinity, Math.max(0, i.qty + delta)) } : i).filter((i) => i.qty > 0)
    );
    setCashGiven("");
  };

  const updateDiscount = (id: string, discount: number) => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, discount: Math.max(0, discount) } : i));
    setCashGiven("");
  };

  const updateItemCashReceived = (id: string, value: number) => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, cashReceived: Math.max(0, value) } : i));
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
    setCashGiven("");
  };

  const clearCart = () => {
    setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setNotes("");
    setCashGiven("");
    setDueDate("");
    setSaleError(null);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || filtered.length === 0) return;
    const match = filtered.find(product => product.barcode === search || product.sku === search) ?? filtered[0];
    const variant = match.variants?.find(variant => variant.sku === search);
    if (variant) addVariantToCart(match, variant);
    else if (match.has_variants) toggleExpanded(match.id);
    else addToCart(match);
    setSearch("");
  };

  // ── totals ───────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = cart.reduce((s, i) => s + i.discount, 0);
  const itemsCashReceivedSum = cart.reduce((s, i) => s + (i.cashReceived || 0), 0);
  const gross = subtotal - discount;
  const taxable = Math.round(gross / (1 + TAX_RATE));
  const tax = gross - taxable;
  const total = gross;
  const change = cashGiven ? Math.max(0, Number(cashGiven) - total) : 0;
  // "Amount Paid Now" — blank means "charge the full amount" (unchanged,
  // normal cash-sale default); an explicit amount below the total is a
  // partial or fully-credit (0) sale, not blocked, but it needs a customer
  // and a due date since it leaves a receivable behind.
  const amountPaidNow = cashGiven !== "" ? Math.max(0, Number(cashGiven)) : total;
  const remainingBalance = Math.max(0, total - amountPaidNow);
  const isCreditSale = remainingBalance > 0;
  const fmt = (v: number) => v.toLocaleString();

  // ── hold / resume ────────────────────────────────────────────────────────
  const holdSale = () => {
    if (saleInFlight.current || cart.length === 0) return;
    setHeldOrders((prev) => [
      { id: `H-${Date.now()}`, label: customerName.trim() || `Parked ${timeLabel()}`, time: timeLabel(), cart, customerName, customerId, notes, payment, cashGiven, dueDate },
      ...prev,
    ]);
    clearCart();
  };

  const resumeHeld = (id: string) => {
    if (saleInFlight.current) return;
    const held = heldOrders.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart);
    setCustomerId(held.customerId ?? null);
    setPayment(held.payment ?? "cash");
    setCashGiven(held.cashGiven ?? "");
    setDueDate(held.dueDate ?? "");
    setCustomerName(held.customerName);
    setNotes(held.notes);
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
    setShowHeld(false);
  };

  const deleteHeld = (id: string) => !saleInFlight.current && setHeldOrders((prev) => prev.filter((h) => h.id !== id));

  // ── complete sale ────────────────────────────────────────────────────────
  const completeSale = async () => {
    if (saleInFlight.current || saving || cart.length === 0) return;
    if (isCreditSale && !customerId) {
      setSaleError("A customer is required for a partial or credit sale.");
      return;
    }
    if (isCreditSale && !dueDate) {
      setSaleError("A due date is required for a partial or credit sale.");
      return;
    }
    saleInFlight.current = true;
    setSaving(true);
    setSaleError(null);
    try {
      // order-level discount is 0 — item discounts are already baked into each line_total
      const created = await createOrder.mutateAsync({
        status: "Completed",
        customer_id: customerId,
        notes: `POS — ${payment}${customerName.trim() ? ` — ${customerName.trim()}` : ""}${notes.trim() ? ` | ${notes.trim()}` : ""}`,
        discount: 0,
        tax,
        payment_method: payment,
        // "Amount Paid Now" — what's actually applied to the invoice.
        amount_paid: amountPaidNow,
        // Cash-drawer bookkeeping only (kept distinct from amount_paid): how
        // much cash physically changed hands and what change was given —
        // blank means "received the full amount" for backward compatibility.
        amount_tendered: cashGiven !== "" ? Number(cashGiven) : total,
        change_due: change,
        due_date: isCreditSale ? dueDate : null,
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

      // Credit over the customer's daily limit is held for the General Manager/CEO: nothing was sold or posted yet,
      // so no receipt — tell the cashier clearly and let them carry on.
      if (created.data.status === "Awaiting Approval") {
        clearCart();
        setSaleError(`Credit above the daily limit for this customer. Order ${created.data.order_number} was sent for approval — no stock or money has been recorded yet.`);
        return;
      }

      const sale: SaleResult = { ...orderToSale(created.data), cashierName: user?.name };
      setCartOpen(false);
      setCompletedSale(sale);
      saveSale(sale);
      setTodayCount((c) => c + 1);
      setTodayRevenue((r) => r + sale.total);
      clearCart();
    } catch (e: unknown) {
      setSaleError(
        (e as { detail?: string })?.detail ??
          "Could not save the sale. Check your connection and try again."
      );
    } finally {
      saleInFlight.current = false;
      setSaving(false);
    }
  };

  const startNewSale = () => {
    clearCart();
    setCartOpen(false);
    setCompletedSale(null);
    setPayment("cash");
  };

  const checkoutPanel = (
    <fieldset disabled={saving} className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
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
              showCashReceived={payment === "cash"}
              onUpdateCashReceived={updateItemCashReceived}
            />
          </div>
          {/* Payment — never grows, scrolls its own content if needed */}
          <div className="flex h-[min(360px,52dvh)] shrink-0 flex-col border-t border-border">
            <div className="flex min-h-0 flex-1 p-3">
              <PaymentPanel
                payment={payment}
                cashGiven={cashGiven}
                subtotal={subtotal}
                discount={discount}
                tax={tax}
                total={total}
                change={change}
                remainingBalance={remainingBalance}
                cartCount={cart.length}
                hasCustomer={!!customerId}
                dueDate={dueDate}
                currencySymbol={currencySymbol}
                fmt={fmt}
                saving={saving}
                saleError={saleError}
                itemsCashReceivedSum={itemsCashReceivedSum}
                onPaymentChange={(m) => { setPayment(m); setCashGiven(""); }}
                onCashChange={setCashGiven}
                onDueDateChange={setDueDate}
                onCharge={completeSale}
                vatEnabled={vatEnabled}
              />
            </div>
          </div>
    </fieldset>
  );

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-dvh min-w-0 flex flex-col overflow-hidden bg-background">
      {/* Receipt modal */}
      <Drawer open={!!completedSale} onClose={startNewSale} side="center" size="md">
        {completedSale && (
          <Receipt sale={completedSale} currencySymbol={currencySymbol} fmt={fmt} onNewSale={startNewSale} vatEnabled={vatEnabled} tenant={tenant} />
        )}
      </Drawer>

      <Drawer open={cartOpen} onClose={() => setCartOpen(false)} side="right" size="md" title="Cart & checkout">
        <div className="flex h-[calc(100dvh-100px)] min-h-0 flex-col">{cartOpen && checkoutPanel}</div>
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
      <div className="flex-1 min-w-0 flex overflow-hidden min-h-0">

        {/* ── Left: catalog ── */}
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Status bar */}
          <div className="flex items-center gap-2 px-4 pt-3 flex-shrink-0">
            {loading ? null : error ? (
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
                aria-label="Search products by name, SKU or barcode"
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by name or SKU… (press / or Enter to add top match)"
                className="min-w-0 flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
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
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap rounded-lg transition-all flex-shrink-0 ${
                  category === c
                    ? "bg-accent text-white"
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
              <PageLoader variant="compact" />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-2 py-16">
                <Search size={28} strokeWidth={1.5} />
                <p className="text-[13px]">
                  {search ? `No results for "${search}"` : "No products in this category"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                {filtered.map((p) => {
                  const inCartQty = cart.filter(item => (item.product_id ?? item.id) === p.id).reduce((sum, item) => sum + item.qty, 0);
                  return (
                    <ProductCard
                      key={p.id}
                      product={p}
                      inCartQty={inCartQty}
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

        {!cartOpen && <aside className="hidden min-w-0 w-[clamp(320px,27vw,400px)] shrink-0 flex-col overflow-hidden border-l border-border bg-card lg:flex">{checkoutPanel}</aside>}

      </div>
      <button onClick={() => setCartOpen(true)} className="m-3 flex min-h-11 shrink-0 items-center justify-between rounded-lg bg-accent px-4 font-semibold text-white lg:hidden">
        <span>Cart · {cart.reduce((sum, item) => sum + item.qty, 0)} items</span><span>{currencySymbol} {fmt(total)}</span>
      </button>
    </div>
  );
}
