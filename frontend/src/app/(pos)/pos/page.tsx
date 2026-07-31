"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { CartPanel } from "@/components/pos/CartPanel";
import { BUSINESS_TYPES } from "@/components/pos/catalog";
import { TAX_RATE, generateInvoiceId, generateOrderId, timeLabel } from "@/components/pos/constants";
import { POSHeader } from "@/components/pos/POSHeader";
import { PaymentPanel } from "@/components/pos/PaymentPanel";
import { ProductCard } from "@/components/pos/ProductCard";
import { Receipt } from "@/components/pos/Receipt";
import type { CartItem, HeldOrder, PaymentMethod, Product, SaleResult } from "@/components/pos/types";
import { useAppConfig } from "@/lib/appConfig";

export default function POSPage() {
  const { currencySymbol, locale, setLocale, locales } = useAppConfig();

  const [businessId, setBusinessId] = useState(BUSINESS_TYPES[0].id);
  const business = useMemo(
    () => BUSINESS_TYPES.find((b) => b.id === businessId) ?? BUSINESS_TYPES[0],
    [businessId]
  );
  const [showBizPicker, setShowBizPicker] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [bumpId, setBumpId] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [customerName, setCustomerName] = useState("");

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showLang, setShowLang] = useState(false);

  const [todayCount, setTodayCount] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);

  const categories = ["All", ...business.categories];

  const filtered = business.products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p: Product) => {
    if (p.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { id: p.id, name: p.name, price: p.price, qty: 1, emoji: p.emoji }];
    });
    setCashGiven("");
    setBumpId(p.id);
    window.setTimeout(() => setBumpId((current) => (current === p.id ? null : current)), 220);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0)
    );
    setCashGiven("");
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));

  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setCustomerName("");
    setCashGiven("");
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || filtered.length === 0) return;
    addToCart(filtered[0]);
    setSearch("");
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const taxableBase = subtotal - discountAmount;
  const tax = Math.round(taxableBase * TAX_RATE);
  const total = taxableBase + tax;
  const change = cashGiven ? Math.max(0, Number(cashGiven) - total) : 0;
  const cashShort = payment === "cash" && cashGiven !== "" && Number(cashGiven) < total;

  const fmt = (v: number) => v.toLocaleString();

  const handleDiscount = (pct: number) => {
    setDiscountPercent(pct);
    setCashGiven("");
  };

  const handlePaymentChange = (m: PaymentMethod) => {
    setPayment(m);
    setCashGiven("");
  };

  const selectBusiness = (id: string) => {
    setCart([]);
    setCategory("All");
    setSearch("");
    setDiscountPercent(0);
    setCustomerName("");
    setCashGiven("");
    setHeldOrders([]);
    setShowHeld(false);
    setBusinessId(id);
  };

  const holdSale = () => {
    if (cart.length === 0) return;
    const held: HeldOrder = {
      id: `H-${Date.now()}`,
      label: customerName.trim() || `Parked ${timeLabel()}`,
      time: timeLabel(),
      cart,
      discountPercent,
      customerName,
    };
    setHeldOrders((prev) => [held, ...prev]);
    clearCart();
  };

  const resumeHeld = (id: string) => {
    const held = heldOrders.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart);
    setDiscountPercent(held.discountPercent);
    setCustomerName(held.customerName);
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
    setShowHeld(false);
  };

  const deleteHeld = (id: string) => {
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
  };

  const completeSale = () => {
    const isInvoice = payment === "invoice";
    setCompletedSale({
      orderId: generateOrderId(),
      invoiceNumber: isInvoice ? generateInvoiceId() : null,
      isInvoice,
      payment,
      customerName: customerName.trim(),
      items: cart,
      subtotal,
      discountPercent,
      discountAmount,
      tax,
      total,
      cashGiven,
      change,
      business,
      timestamp: new Date(),
    });
    setTodayCount((c) => c + 1);
    setTodayRevenue((r) => r + total);
  };

  const startNewSale = () => {
    clearCart();
    setCompletedSale(null);
    setPayment("cash");
  };

  if (completedSale) {
    return <Receipt sale={completedSale} currencySymbol={currencySymbol} fmt={fmt} onNewSale={startNewSale} />;
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-surface"
      style={{ ["--accent" as string]: business.accent }}
    >
      <POSHeader
        business={business}
        showBizPicker={showBizPicker}
        heldCount={heldOrders.length}
        heldOrders={heldOrders}
        showHeld={showHeld}
        todayCount={todayCount}
        todayRevenue={todayRevenue}
        locale={locale}
        locales={locales}
        currencySymbol={currencySymbol}
        fmt={fmt}
        onToggleBizPicker={() => setShowBizPicker((v) => !v)}
        onSelectBusiness={selectBusiness}
        onToggleHeld={() => setShowHeld((v) => !v)}
        onResumeHeld={resumeHeld}
        onDeleteHeld={deleteHeld}
        onToggleLang={() => setShowLang((v) => !v)}
        showLang={showLang}
        onSetLocale={(c) => setLocale(c)}
      />

      <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3 min-h-0">
          <div className="flex items-center gap-2 bg-white border border-border rounded-xl px-3 py-2.5 focus-within:border-accent transition-colors">
            <Search size={15} className="text-muted flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={`Search ${business.label.toLowerCase()} or press Enter to scan the top match...`}
              className="flex-1 text-[14px] outline-none bg-transparent text-foreground placeholder:text-muted"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className="text-muted hover:text-foreground transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 flex-shrink-0">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-2 text-[13px] font-semibold whitespace-nowrap rounded-full transition-all flex-shrink-0 ${
                  category === c
                    ? "bg-accent text-white shadow-sm"
                    : "bg-white border border-border text-foreground/60 hover:text-foreground hover:border-accent/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-2 py-16">
                <Search size={28} strokeWidth={1.5} />
                <p className="text-[14px]">Nothing here matches &quot;{search}&quot;. Try a different word or category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map((p) => {
                  const inCart = cart.find((i) => i.id === p.id);
                  return (
                    <ProductCard
                      key={p.id}
                      product={p}
                      inCartQty={inCart?.qty ?? 0}
                      bumping={bumpId === p.id}
                      currencySymbol={currencySymbol}
                      fmt={fmt}
                      onAdd={addToCart}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-[360px] flex-shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-border flex flex-col max-h-[55vh] lg:max-h-none">
          <CartPanel
            cart={cart}
            customerName={customerName}
            discountPercent={discountPercent}
            discountAmount={discountAmount}
            currencySymbol={currencySymbol}
            fmt={fmt}
            onCustomerChange={setCustomerName}
            onUpdateQty={updateQty}
            onRemoveItem={removeItem}
            onClear={clearCart}
            onDiscount={handleDiscount}
            onHold={holdSale}
          />
          <div className="border-t border-border p-4">
            <PaymentPanel
              payment={payment}
              cashGiven={cashGiven}
              subtotal={subtotal}
              discountAmount={discountAmount}
              tax={tax}
              total={total}
              change={change}
              cashShort={cashShort}
              cartCount={cart.length}
              hasCustomer={customerName.trim().length > 0}
              currencySymbol={currencySymbol}
              fmt={fmt}
              onPaymentChange={handlePaymentChange}
              onCashChange={setCashGiven}
              onCharge={completeSale}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
