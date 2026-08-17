"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ShoppingBasket, X } from "lucide-react";

import { CartPanel } from "@/components/pos/CartPanel";
import { PaymentPanel } from "@/components/pos/PaymentPanel";
import { Receipt } from "@/components/pos/Receipt";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useCustomers } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";

export default function MobileCartPage() {
  const { data } = useCustomers(1, 500);
  const customers = data?.items ?? [];
  const { vatEnabled } = useAppConfig();

  const {
    cart, customerId, customerName, notes, currencySymbol, fmt,
    totalItems, total, subtotal, tax, discount, payment, cashGiven, change, cashShort,
    saleError, saving, completedSale,
    setCustomer, setNotes, setPayment, setCashGiven,
    updateQty, updateDiscount, removeItem, clearCart, holdSale,
    completeSale, startNewSale,
  } = useMobilePos();

  if (completedSale) {
    return (
      <div className="min-h-full bg-card">
        <Receipt
          sale={completedSale}
          currencySymbol={currencySymbol}
          fmt={fmt}
          onNewSale={() => {
            startNewSale();
          }}
          vatEnabled={vatEnabled}
        />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-full flex flex-col">
        <PageHeader />
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
          <ShoppingBasket size={30} className="text-muted/40 mb-2" />
          <p className="text-[13px] text-muted">Your cart is empty</p>
          <Link
            href="/pos"
            className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold"
          >
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader />

      <div className="flex-1 min-h-0 px-3 pt-2 overflow-y-auto">
        <CartPanel
          cart={cart}
          customers={customers}
          customerId={customerId}
          customerName={customerName}
          notes={notes}
          currencySymbol={currencySymbol}
          fmt={fmt}
          onCustomerChange={(id, name) => setCustomer(id, name)}
          onNotesChange={setNotes}
          onUpdateQty={updateQty}
          onUpdateDiscount={updateDiscount}
          onRemoveItem={removeItem}
          onClear={clearCart}
          onHold={holdSale}
        />
      </div>

      {/* Inline PaymentPanel */}
      <div className="flex-shrink-0 border-t border-border overflow-y-auto max-h-[55%]">
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
            cartCount={totalItems}
            hasCustomer={customerName.trim().length > 0}
            vatEnabled={vatEnabled}
            currencySymbol={currencySymbol}
            fmt={fmt}
            saving={saving}
            saleError={saleError}
            onPaymentChange={setPayment}
            onCashChange={setCashGiven}
            onCharge={() => void completeSale()}
          />
        </div>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border flex items-center gap-2 px-3 py-3">
      <Link
        href="/pos"
        className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-foreground/70"
        aria-label="Back"
      >
        <ArrowLeft size={16} />
      </Link>
      <h1 className="text-[15px] font-bold text-foreground">Cart</h1>
    </header>
  );
}
