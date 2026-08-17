"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { TAX_RATE, generateOrderId, timeLabel } from "@/components/pos/constants";
import type { CartItem, HeldOrder, PaymentMethod, Product, SaleResult, Variant } from "@/components/pos/types";
import { useCreateOrder } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { saveSale } from "@/lib/invoices";

interface MobilePosContextValue {
  cart: CartItem[];
  heldOrders: HeldOrder[];
  customerId: string | null;
  customerName: string;
  notes: string;
  payment: PaymentMethod;
  cashGiven: string;
  saleError: string | null;
  saving: boolean;
  completedSale: SaleResult | null;
  todayCount: number;
  todayRevenue: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  change: number;
  cashShort: boolean;
  totalItems: number;
  currencySymbol: string;
  fmt: (v: number) => string;
  addToCart: (p: Product) => void;
  addVariantToCart: (p: Product, v: Variant) => void;
  updateQty: (id: string, delta: number) => void;
  updateDiscount: (id: string, discount: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  holdSale: () => void;
  resumeHeld: (id: string) => void;
  deleteHeld: (id: string) => void;
  setCustomer: (id: string | null, name: string) => void;
  setNotes: (v: string) => void;
  setPayment: (m: PaymentMethod) => void;
  setCashGiven: (v: string) => void;
  completeSale: (overrides?: { payment?: PaymentMethod; cashGiven?: string }) => Promise<void>;
  startNewSale: () => void;
}

const MobilePosContext = createContext<MobilePosContextValue | null>(null);

export function MobilePosProvider({ children }: { children: ReactNode }) {
  const { currencySymbol } = useAppConfig();
  const createOrder = useCreateOrder();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotesState] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  const addToCart = useCallback((p: Product) => {
    if (p.stock <= 0 || p.has_variants) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, {
        id: p.id, product_id: p.id, variant_id: null, name: p.name, price: p.price, qty: 1,
        emoji: p.emoji, discount: 0, image_url: p.image_url, sku: p.sku, variant_attributes: null,
      }];
    });
    setCashGiven("");
  }, []);

  const addVariantToCart = useCallback((p: Product, v: Variant) => {
    const id = `${p.id}::${v.id}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) return prev.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, {
        id, product_id: p.id, variant_id: v.id, name: p.name, price: v.price, qty: 1,
        emoji: p.emoji, discount: 0, image_url: p.image_url, sku: v.sku ?? p.sku,
        variant_attributes: v.attributes,
      }];
    });
    setCashGiven("");
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart((prev) => prev
      .map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
      .filter((i) => i.qty > 0));
  }, []);

  const updateDiscount = useCallback((id: string, discount: number) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, discount: Math.max(0, discount) } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setNotesState("");
    setCashGiven("");
    setSaleError(null);
  }, []);

  const holdSale = useCallback(() => {
    if (cart.length === 0) return;
    setHeldOrders((prev) => [{
      id: `H-${Date.now()}`,
      label: customerName.trim() || `Parked ${timeLabel()}`,
      time: timeLabel(),
      cart,
      customerName,
      notes,
    }, ...prev]);
    clearCart();
  }, [cart, customerName, notes, clearCart]);

  const resumeHeld = useCallback((id: string) => {
    setHeldOrders((prev) => {
      const held = prev.find((h) => h.id === id);
      if (held) {
        setCart(held.cart);
        setCustomerName(held.customerName);
        setNotesState(held.notes);
      }
      return prev.filter((h) => h.id !== id);
    });
  }, []);

  const deleteHeld = useCallback((id: string) => {
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const setCustomer = useCallback((id: string | null, name: string) => {
    setCustomerId(id);
    setCustomerName(name);
  }, []);

  const setNotes = useCallback((v: string) => setNotesState(v), []);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const discount = useMemo(() => cart.reduce((s, i) => s + i.discount, 0), [cart]);
  const gross = subtotal - discount;
  const taxable = Math.round(gross / (1 + TAX_RATE));
  const tax = gross - taxable;
  const total = gross;
  const change = cashGiven ? Math.max(0, Number(cashGiven) - total) : 0;
  const cashShort = payment === "cash" && cashGiven !== "" && Number(cashGiven) < total;
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const fmt = (v: number) => v.toLocaleString();

  const completeSale = useCallback(async (overrides?: { payment?: PaymentMethod; cashGiven?: string }) => {
    if (saving || cart.length === 0) return;
    const pay = overrides?.payment ?? payment;
    const cash = overrides?.cashGiven ?? cashGiven;
    setSaving(true);
    setSaleError(null);
    const changeAmt = cash ? Math.max(0, Number(cash) - total) : 0;
    try {
      await createOrder.mutateAsync({
        status: "Completed",
        customer_id: customerId,
        notes: `POS — ${pay}${notes ? ` — ${notes}` : ""}`,
        discount,
        tax,
        items: cart.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          product_name: i.name,
          sku: i.sku,
          variant_attributes: i.variant_attributes,
          unit_price: i.price,
          quantity: i.qty,
          discount: i.discount,
          line_total: i.price * i.qty - i.discount,
        })),
      });
      const sale: SaleResult = {
        orderId: generateOrderId(),
        payment: pay,
        customerName: customerName.trim(),
        notes,
        items: cart,
        subtotal,
        discount,
        tax,
        total,
        cashGiven: cash,
        change: changeAmt,
        timestamp: new Date(),
      };
      saveSale(sale);
      setCompletedSale(sale);
      setTodayCount((c) => c + 1);
      setTodayRevenue((r) => r + total);
      clearCart();
    } catch (e) {
      setSaleError((e as { detail?: string })?.detail ?? "Failed to save sale");
    } finally {
      setSaving(false);
    }
  }, [saving, cart, payment, customerId, notes, discount, tax, subtotal, total, cashGiven, customerName, createOrder, clearCart]);

  const startNewSale = useCallback(() => {
    setCompletedSale(null);
    setPayment("cash");
    setCashGiven("");
  }, []);

  const value: MobilePosContextValue = {
    cart, heldOrders, customerId, customerName, notes, payment, cashGiven, saleError, saving,
    completedSale, todayCount, todayRevenue, subtotal, discount, tax, total, change, cashShort,
    totalItems, currencySymbol, fmt,
    addToCart, addVariantToCart, updateQty, updateDiscount, removeItem, clearCart,
    holdSale, resumeHeld, deleteHeld, setCustomer, setNotes, setPayment, setCashGiven,
    completeSale, startNewSale,
  };

  return <MobilePosContext.Provider value={value}>{children}</MobilePosContext.Provider>;
}

export function useMobilePos() {
  const ctx = useContext(MobilePosContext);
  if (!ctx) throw new Error("useMobilePos must be used within MobilePosProvider");
  return ctx;
}
