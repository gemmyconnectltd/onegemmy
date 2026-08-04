"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, ShoppingBasket } from "lucide-react";

import { CartPanel } from "@/components/pos/CartPanel";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useCustomers } from "@/lib/api/hooks";

export default function MobileCartPage() {
  const router = useRouter();
  const { data } = useCustomers(1, 500);
  const customers = data?.items ?? [];

  const {
    cart, customerId, customerName, notes, currencySymbol, fmt,
    totalItems, total, subtotal, tax, discount,
    setCustomer, setNotes, updateQty, updateDiscount, removeItem, clearCart, holdSale,
  } = useMobilePos();

  if (cart.length === 0) {
    return (
      <div className="min-h-full flex flex-col">
        <PageHeader />
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
          <ShoppingBasket size={30} className="text-muted/40 mb-2" />
          <p className="text-[13px] text-muted">Your cart is empty</p>
          <Link
            href="/m/pos"
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

      <div className="flex-1 min-h-0 px-3 pt-2">
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

      {/* Checkout summary bar */}
      <div className="flex-shrink-0 px-3 pt-2 pb-3 border-t border-border bg-card">
        <div className="flex items-center justify-between text-[12px] text-muted mb-1 font-mono">
          <span>{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
          {discount > 0 && <span>-{currencySymbol} {fmt(discount)}</span>}
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] text-muted">
            {currencySymbol} {fmt(subtotal)} · tax {currencySymbol} {fmt(tax)}
          </span>
          <span className="text-[15px] font-bold text-foreground font-mono">
            {currencySymbol} {fmt(total)}
          </span>
        </div>
        <button
          onClick={() => router.push("/m/payment")}
          className="w-full py-3.5 rounded-xl bg-accent text-white font-bold text-[14px] flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition"
        >
          Continue to payment <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border flex items-center gap-2 px-3 py-3">
      <Link
        href="/m"
        className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-foreground/70"
        aria-label="Back"
      >
        <ArrowLeft size={16} />
      </Link>
      <h1 className="text-[15px] font-bold text-foreground">Cart</h1>
    </header>
  );
}
