"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import { CartPanel } from "@/components/pos/CartPanel";
import { timeLabel } from "@/components/pos/constants";
import { POSHeader } from "@/components/pos/POSHeader";
import { PaymentPanel, type Checkout } from "@/components/pos/PaymentPanel";
import { ConfirmSaleDialog } from "@/components/pos/ConfirmSaleDialog";
import { ProductCard } from "@/components/pos/ProductCard";
import { Receipt } from "@/components/pos/Receipt";
import type { CartItem, HeldOrder, PaymentMethod, Product, SaleResult, Variant } from "@/components/pos/types";
import { PosDiscounts, type ManualRequest } from "@/components/pos/PosDiscounts";
import { usePricingExpiry } from "@/components/pos/usePricingExpiry";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAppConfig } from "@/lib/appConfig";
import { orderToSale } from "@/lib/orders";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/can";
import { saleAtLabel } from "@/components/pos/SaleDate";
import { SALE_DATE_FOR_EVERYONE } from "@/components/pos/constants";
import { CalendarClock, UserRound, UserPlus } from "lucide-react";
import { saveSale } from "@/lib/invoices";
import { useCategories, useCatalogPrices, useDiscountSettings, useDiscountPrice, useRequestDiscountApproval, useProducts, useCustomers, useCreateOrder, useSalesTeam, useCurrentTenant, useVatRate } from "@/lib/api/hooks";
import type { ApiProduct } from "@/lib/api";
import { usePageTitle } from "@/lib/pageTitles";

function apiToProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    cost: p.cost,
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
      barcode: v.barcode,
      attributes: v.attributes,
      price: v.price,
      cost: v.cost,
      stock: v.stock,
    })),
  };
}
export default function POSPage() {
  usePageTitle("Point of Sale");
  const { currencySymbol, locale, setLocale, locales, theme, setTheme, vatEnabled: configuredVatEnabled } = useAppConfig();
  const vat = useVatRate();
  const vatEnabled = vat.data?.enabled ?? configuredVatEnabled;
  const { data: tenant } = useCurrentTenant();

  const [category, setCategory] = useState("All");
  const categoryData = useCategories();
  const selectedCategoryId = categoryData.data?.items.find(item => item.name === category)?.id;
  const [catalogPage, setCatalogPage] = useState(1);
  const [search, setSearch] = useState("");

  // ── inventory ────────────────────────────────────────────────────────────
  const { data: productData, isLoading, isPlaceholderData, isError, refetch } = useProducts(catalogPage, 40, search || undefined, true, undefined, undefined, selectedCategoryId);
  const loading = isLoading || isPlaceholderData;
  const error = isError ? "Failed to load inventory. Check your connection." : null;
  const products = useMemo(
    () => (productData?.items ?? []).filter((p) => p.is_active).map(apiToProduct),
    [productData]
  );

  const categories = useMemo(
    () => ["All", ...(categoryData.data?.items.map(item => item.name) ?? Array.from(new Set(products.map((product) => product.category))))],
    [categoryData.data, products]
  );

  const { data: customersData } = useCustomers(1, 500);
  const customers = customersData?.items ?? [];

  const createOrder = useCreateOrder();

  // ── ui state ─────────────────────────────────────────────────────────────
  const [showLang, setShowLang] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const saleInFlight = useRef(false);
  const [cartOpen, setCartOpen] = useState(false);
  const can = useCan();
  const { user, hasPermission, activeBranchId } = useAuth();
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
  const [saleAt, setSaleAt] = useState<string | null>(null);
  const team = useSalesTeam();
  const [salespersonId, setSalespersonId] = useState("");
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
  const [review, setReview] = useState<Checkout | null>(null);

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
            (p.variants ?? []).some(variant => ((variant.sku ?? "").toLowerCase().includes(search.toLowerCase()) || (variant.barcode ?? "").toLowerCase().includes(search.toLowerCase()))))
      ),
    [products, category, search]
  );

  // ── cart actions ─────────────────────────────────────────────────────────
  const addToCart = (p: Product) => {
    if (saleInFlight.current || p.stock <= 0 || p.has_variants) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => i.id === p.id ? { ...i, qty: Math.min(p.stock, i.qty + 1) } : i);
      return [...prev, { id: p.id, product_id: p.id, variant_id: null, name: p.name, price: Number(pricesByProduct[p.id]?.original_unit_price ?? p.price), cost: p.cost, qty: 1, emoji: p.emoji, discount: 0, image_url: p.image_url, sku: p.sku, variant_attributes: null }];
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
        id, product_id: p.id, variant_id: v.id, name: p.name, price: Number(pricesByVariant[v.id]?.original_unit_price ?? v.price), cost: v.cost,
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

  const updatePrice = (id: string, price: number) => {
    if (saleInFlight.current || !Number.isFinite(price) || price < 0) return;
    const item = cart.find(line => line.id === id);
    const product = products.find(product => product.id === item?.product_id);
    const cost = item?.variant_id ? product?.variants?.find(variant => variant.id === item.variant_id)?.cost : product?.cost;
    if (price < (cost ?? item?.cost ?? 0)) {
      setSaleError("The selling price cannot be below unit cost.");
      return;
    }
    setCart(previous => previous.map(line => line.id === id ? {
      ...line, price: Math.round(price * 100) / 100,
      discount: Math.min(line.discount, Math.round(price * line.qty * 100) / 100),
    } : line));
    setCashGiven("");
    setApprovalId(undefined);
    setReview(null);
    setSaleError(null);
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
    setCouponCode(""); setManualValue(""); setDiscountReason(""); setApprovalId(undefined);
    setCustomerId(null);
    setSaleAt(null);
    setCustomerName("");
    setNotes("");
    setCashGiven("");
    setDueDate("");
    setSaleError(null);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || filtered.length === 0) return;
    const match = filtered.find(product => product.barcode === search || product.sku === search) ?? filtered[0];
    const variant = match.variants?.find(variant => variant.sku === search || variant.barcode === search);
    if (variant) addVariantToCart(match, variant);
    else if (match.has_variants) toggleExpanded(match.id);
    else addToCart(match);
    setSearch("");
  };

  const checkoutReference = useRef<string>("");
  const discountSettings = useDiscountSettings();
  const [couponCode, setCouponCode] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualKind, setManualKind] = useState<"percent" | "fixed">("percent");
  const [discountReason, setDiscountReason] = useState("");
  const [approvalId, setApprovalId] = useState<string>();
  const requestDiscountApproval = useRequestDiscountApproval();
  const manualAvailable = !!discountSettings.data?.enabled && !!discountSettings.data?.manual_pos && hasPermission("discounts:apply");
  const pricingInput = {
    items: cart.map(i => ({ product_id: i.product_id ?? null, variant_id: i.variant_id ?? null, unit_price: i.price, quantity: i.qty, discount: manualAvailable ? i.discount : 0 })),
    customer_id: customerId, channel: "pos" as const, manual_reason: discountReason || undefined, discount_approval_id: approvalId,
    coupon_codes: discountSettings.data?.enabled && discountSettings.data.coupons && couponCode.trim() ? [couponCode.trim()] : [],
    ...(manualAvailable && Number(manualValue) > 0 ? { manual_discount: { kind: manualKind, value: Number(manualValue), reason: discountReason } } : {}),
  };
  const pricingContext = `${activeBranchId ?? "main"}:${saleAt ?? "now"}`;
  const discountPricing = useDiscountPrice(pricingInput, !!discountSettings.data?.enabled && cart.length > 0, pricingContext);
  const cartPricingExpired = usePricingExpiry(discountPricing.data?.valid_until, discountPricing.refetch);
  const livePricing = discountSettings.data?.enabled && !cartPricingExpired ? discountPricing.data : undefined;
  const catalogInput = {
    products: products.flatMap<{ product_id: string; variant_id: string | null }>(product => product.has_variants ? (product.variants ?? []).map(variant => ({ product_id: product.id, variant_id: variant.id })) : [{ product_id: product.id, variant_id: null }]),
    customer_id: customerId,
    ...(cart.length ? { cart: pricingInput } : {}),
  };
  const catalogPricing = useCatalogPrices(catalogInput, !!discountSettings.data?.enabled && catalogInput.products.length > 0, pricingContext);
  const catalogExpired = usePricingExpiry(catalogPricing.data?.valid_until, catalogPricing.refetch);
  const verifiedCatalog = discountSettings.data?.enabled && !catalogExpired && !catalogPricing.isError ? catalogPricing.data?.items ?? [] : [];
  const pricesByProduct = Object.fromEntries(verifiedCatalog.filter(price => !price.variant_id).map(price => [price.product_id, price]));
  const pricesByVariant = Object.fromEntries(verifiedCatalog.filter(price => price.variant_id).map(price => [price.variant_id!, price]));
  const confirmedPricing = useRef<string | undefined>(undefined);

  const pricingBlocked = discountSettings.isPending || discountSettings.isError || (discountSettings.data?.enabled && cart.length > 0 && (discountPricing.isFetching || discountPricing.isError || !livePricing || !!livePricing.blocked || !!livePricing.coupon_errors?.length || (livePricing.approval_required && livePricing.approval_status !== "approved")));

  // ── totals ───────────────────────────────────────────────────────────────
  const subtotal = livePricing ? Number(livePricing.subtotal) : cart.reduce((sum, item) => sum + Math.round(item.price * item.qty * 100), 0) / 100;
  const discount = livePricing ? Number(livePricing.total_discount) : manualAvailable ? cart.reduce((sum, item) => sum + item.discount, 0) : 0;
  const itemsCashReceivedSum = cart.reduce((s, i) => s + (i.cashReceived || 0), 0);
  const gross = subtotal - discount;
  // The server sends the VAT rate as a percentage (18), the sums below use a fraction (0.18).
  const vatRate = vatEnabled ? (vat.data?.rate ?? 0) / 100 : 0;
  const taxable = Math.round(gross / (1 + vatRate) * 100) / 100;
  const tax = livePricing ? Number(livePricing.tax) : Math.round((gross - taxable) * 100) / 100;
  const total = livePricing ? Number(livePricing.total) : gross;
  const fmt = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  // ── hold / resume ────────────────────────────────────────────────────────
  const holdSale = () => {
    if (saleInFlight.current || cart.length === 0) return;
    setHeldOrders((prev) => [
      { id: `H-${Date.now()}`, label: customerName.trim() || `Parked ${timeLabel()}`, time: timeLabel(), cart, customerName, customerId, notes, payment, cashGiven, dueDate, discountContext: { couponCode, manualValue, manualKind, discountReason, approvalId } },
      ...prev,
    ]);
    clearCart();
  };

  const resumeHeld = (id: string) => {
    if (saleInFlight.current) return;
    const held = heldOrders.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart);
    setCouponCode(held.discountContext?.couponCode ?? "");
    setManualValue(held.discountContext?.manualValue ?? "");
    setManualKind(held.discountContext?.manualKind ?? "percent");
    setDiscountReason(held.discountContext?.discountReason ?? "");
    setApprovalId(held.discountContext?.approvalId);
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
  // Simple full payments are charged straight away. Anything with a split, a debt or a past date is reviewed first.
  const requestCharge = (checkout: Checkout) => {
    if (saleInFlight.current || saving || cart.length === 0) return;
    if (pricingBlocked) return;
    confirmedPricing.current = livePricing?.pricing_hash;
    if (checkout.kind !== "single" || checkout.outstanding > 0 || saleAt) setReview(checkout);
    else void completeSale(checkout);
  };

  const completeSale = async (checkout: Checkout) => {
    if (saleInFlight.current || saving || cart.length === 0) return;
    if (checkout.outstanding > 0 && !customerId) {
      setReview(null);
      setSaleError("A customer is required for a partial or credit sale.");
      return;
    }
    if (checkout.outstanding > 0 && !checkout.dueDate) {
      setReview(null);
      setSaleError("A due date is required for a partial or credit sale.");
      return;
    }
    saleInFlight.current = true;
    setSaving(true);
    setSaleError(null);
    try {
      // order-level discount is 0 — item discounts are already baked into each line_total
      if (pricingBlocked) throw new Error("Wait for valid discount pricing before checkout.");
      if (discountSettings.data?.enabled && confirmedPricing.current !== livePricing?.pricing_hash) throw new Error("Pricing changed. Review the refreshed total and charge again.");
      if (!checkoutReference.current) checkoutReference.current = crypto.randomUUID();
      const created = await createOrder.mutateAsync({
        status: "Completed",
        pricing_channel: "pos",
        expected_pricing_hash: discountSettings.data?.enabled ? confirmedPricing.current : undefined,
        client_order_id: checkoutReference.current,
        ...(discountSettings.data?.enabled ? { coupon_codes: pricingInput.coupon_codes, manual_discount: pricingInput.manual_discount, manual_discount_reason: discountReason || undefined, discount_approval_id: approvalId } : {}),
        customer_id: customerId,
        ...(saleAt ? { ordered_at: new Date(saleAt).toISOString() } : {}),
        ...(salespersonId ? { salesperson_id: salespersonId } : {}),
        notes: `POS — ${checkout.kind === "split" ? "split" : checkout.kind === "credit" ? "credit" : payment}${customerName.trim() ? ` — ${customerName.trim()}` : ""}${notes.trim() ? ` | ${notes.trim()}` : ""}`,
        discount: 0,
        tax,
        // One sale. A split sends one entry per payment; everything else uses the single-payment fields exactly as before.
        ...(checkout.kind === "split"
          ? { payments: checkout.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })) }
          : checkout.kind === "credit"
            ? { payment_method: "cash", amount_paid: 0 }
            : { payment_method: checkout.payments[0]?.method ?? payment, amount_paid: checkout.paid, amount_tendered: checkout.payments[0]?.tendered ?? checkout.paid, change_due: checkout.change, payment_reference: checkout.payments[0]?.reference ?? null }),
        due_date: checkout.outstanding > 0 ? checkout.dueDate : null,
        items: cart.map((i, index) => ({
          product_id: i.product_id ?? null,
          variant_id: i.variant_id ?? null,
          product_name: i.name,
          sku: i.sku ?? null,
          variant_attributes: i.variant_attributes ?? null,
          unit_price: i.price,
          quantity: i.qty,
          discount: pricingInput.items[index].discount,
          line_total: i.price * i.qty - pricingInput.items[index].discount,
        })),
      });

      checkoutReference.current = "";
      setCouponCode(""); setManualValue(""); setApprovalId(undefined);
      // Credit over the customer's daily limit is held for the General Manager/CEO: nothing was sold or posted yet,
      // so no receipt — tell the cashier clearly and let them carry on.
      if (created.data.status === "Awaiting Approval") {
        clearCart();
        setSaleError(created.data.held_reason === "policy"
          ? `Order ${created.data.order_number} was sent for approval. No stock or money has been recorded: take payment once it is approved.`
          : `Credit above the daily limit for this customer. Order ${created.data.order_number} was sent for approval — no stock or money has been recorded yet.`);
        return;
      }

      const sale: SaleResult = { ...orderToSale(created.data), cashierName: user?.name, customerId: created.data.customer_id ?? null };
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
    <fieldset disabled={saving} className="flex h-full min-h-0 min-w-0 flex-1 flex-col [min-inline-size:0]">
          {/* Cart items: take all the space the header and the checkout footer leave, never less than a usable floor, scrolling on their own */}
          <div className="min-h-[11rem] flex-1 overflow-hidden">
            <CartPanel
              cart={cart.map(item => {
                const product = products.find(product => product.id === item.product_id);
                const cost = item.variant_id ? product?.variants?.find(variant => variant.id === item.variant_id)?.cost : product?.cost;
                return { ...item, cost: cost ?? item.cost };
              })}
              linePricing={livePricing?.lines}
              customers={customers}
              customerId={customerId}
              customerName={customerName}
              notes={notes}
              currencySymbol={currencySymbol}
              fmt={fmt}
              onCustomerChange={(id, name) => { setCustomerId(id || null); setCustomerName(name); }}
              saleAt={saleAt}
              onSaleAtChange={setSaleAt}
              team={team.data ?? []}
              salespersonId={salespersonId}
              onSalespersonChange={setSalespersonId}
              onNotesChange={setNotes}
              onUpdateQty={updateQty}
              onUpdateDiscount={updateDiscount}
              onUpdatePrice={updatePrice}
              priceEditingDisabled={saving}
              onRemoveItem={removeItem}
              onClear={clearCart}
              onHold={holdSale}
              showCashReceived={payment === "cash"}
              onUpdateCashReceived={updateItemCashReceived}
            />
          </div>
          {/* Checkout footer: natural height; on a short screen it scrolls itself instead of crushing the cart */}
          <div className="max-h-[58%] shrink-0 overflow-y-auto overscroll-contain border-t border-border bg-card p-3 shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.12)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {discountSettings.data && <PosDiscounts settings={discountSettings.data} canApply={hasPermission("discounts:apply")} cart={cart} pricing={livePricing}
                error={discountPricing.error?.message} coupon={pricingInput.coupon_codes[0] ?? ""} onCoupon={code => { setCouponCode(code); setApprovalId(undefined); setCashGiven(""); }}
                onManual={(request: ManualRequest) => {
                  setDiscountReason(request.reason); setApprovalId(undefined); setCashGiven("");
                  setCart(items => items.map(item => ({ ...item, discount: request.scope === item.id ? (request.kind === "percent" ? Math.round(item.price * item.qty * request.value) / 100 : request.value) : 0 })));
                  setManualKind(request.kind); setManualValue(request.scope === "sale" ? String(request.value) : "");
                }}
                onRemoveManual={() => { setManualValue(""); setCart(items => items.map(item => ({ ...item, discount: 0 }))); setApprovalId(undefined); setCashGiven(""); }}
                money={amount => `${currencySymbol} ${fmt(amount)}`} approvalId={approvalId} onApprovalId={setApprovalId} requesting={requestDiscountApproval.isPending}
                onRequestApproval={() => requestDiscountApproval.mutate({ ...pricingInput, reason: discountReason }, { onSuccess: result => setSaleError(`Discount approval requested: ${result.data.id}`), onError: error => setSaleError(error.message) })} />}
              <PaymentPanel
                payment={payment}
                cashGiven={cashGiven}
                subtotal={subtotal}
                discount={discount}
                discountBreakdown={livePricing ? { product: Number(livePricing.product_discount_total), order: Number(livePricing.order_discount_total), coupon: Number(livePricing.coupon_discount_total) } : undefined}
                tax={tax}
                total={total}
                cartCount={cart.length}
                hasCustomer={!!customerId}
                customerName={customerName}
                customerId={customerId}
                dueDate={dueDate}
                currencySymbol={currencySymbol}
                fmt={fmt}
                saving={saving}
                pricingPending={discountSettings.isPending || (discountSettings.data?.enabled && discountPricing.isFetching && cart.length > 0)}
                checkoutBlocked={!!pricingBlocked}
                approvalPending={!!livePricing?.approval_required && livePricing.approval_status !== "approved"}
                saleError={saleError}
                itemsCashReceivedSum={itemsCashReceivedSum}
                onPaymentChange={(m) => { setPayment(m); setCashGiven(""); }}
                onCashChange={setCashGiven}
                onDueDateChange={setDueDate}
                onCharge={requestCharge}
                notes={notes}
                onNotesChange={setNotes}
                vatEnabled={vatEnabled}
                vatRate={vatRate}
              />
          </div>
    </fieldset>
  );

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-dvh min-w-0 flex flex-col overflow-hidden bg-background">
      {/* Review before confirming anything other than a simple full payment */}
      {review && (
        <ConfirmSaleDialog checkout={review} cart={cart.map((item, index) => ({ ...item, discount: Number(livePricing?.lines[index]?.discount ?? pricingInput.items[index].discount) }))} total={total} customerName={customerName} saleAt={saleAt} currencySymbol={currencySymbol} fmt={fmt} saving={saving || !!pricingBlocked}
          onCancel={() => setReview(null)} onConfirm={() => { const c = review; setReview(null); void completeSale(c); }} />
      )}
      {/* Receipt modal */}
      <Drawer open={!!completedSale} onClose={startNewSale} side="center" size="md">
        {completedSale && (
          <Receipt sale={completedSale} currencySymbol={currencySymbol} fmt={fmt} onNewSale={startNewSale} vatEnabled={vatEnabled} tenant={tenant} />
        )}
      </Drawer>

      <Drawer open={cartOpen} onClose={() => setCartOpen(false)} side="right" size="md" title="Cart & checkout">
        <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col">{cartOpen && checkoutPanel}</div>
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
                onChange={(e) => { setSearch(e.target.value); setCatalogPage(1); }}
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
                onClick={() => { setCategory(c); setCatalogPage(1); }}
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

          {discountSettings.data?.enabled && catalogPricing.isPending && products.length > 0 && <PageLoader variant="compact" />}
          {catalogPricing.isError && <p role="status" className="px-4 py-2 text-xs text-muted">Offers could not be verified. Regular prices are shown; checkout verifies pricing.</p>}
          <div className="flex items-center justify-between gap-2 px-4 py-2"><Button size="sm" variant="secondary" disabled={catalogPage <= 1} onClick={() => { setCatalogPage(page => page - 1); setCategory("All"); }}>Previous</Button><span className="text-xs text-muted">Page {catalogPage} of {Math.max(1, Math.ceil((productData?.total ?? 0) / 40))}</span><Button size="sm" variant="secondary" disabled={catalogPage * 40 >= (productData?.total ?? 0)} onClick={() => { setCatalogPage(page => page + 1); setCategory("All"); }}>Next</Button></div>
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
                      pricing={pricesByProduct[p.id]}
                      variantPricing={pricesByVariant}
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
      {/* Phone: who the sale is for and when it happened stay in view here; tap to change them in the cart. */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2 lg:hidden">
        <button type="button" onClick={() => setCartOpen(true)} aria-label="Customer: change or add" className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-[13px]">
          <UserRound size={14} className={customerName ? "shrink-0 text-accent" : "shrink-0 text-muted"} aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium">{customerName || "Walk-in customer"}</span>
          <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-accent">{customerName ? "Change" : <><UserPlus size={13} aria-hidden />Add</>}</span>
        </button>
        {(SALE_DATE_FOR_EVERYONE || can("orders", "approve")) && <button type="button" onClick={() => setCartOpen(true)} aria-label="Sale date: change" className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium ${saleAt ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "border-border bg-surface"}`}>
          <CalendarClock size={14} aria-hidden /><span className="max-w-[7.5rem] truncate">{saleAt ? saleAtLabel(saleAt) : "Now"}</span>
        </button>}
      </div>
      <button onClick={() => setCartOpen(true)} className="m-3 flex min-h-11 shrink-0 items-center justify-between rounded-lg bg-accent px-4 font-semibold text-white lg:hidden">
        <span>Cart · {cart.reduce((sum, item) => sum + item.qty, 0)} items</span><span>{currencySymbol} {fmt(total)}</span>
      </button>
    </div>
  );
}
