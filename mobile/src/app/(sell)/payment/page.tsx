"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBasket } from "lucide-react";

import { PaymentPanel } from "@/components/pos/PaymentPanel";
import { Receipt } from "@/components/pos/Receipt";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";

export default function MobilePaymentPage() {
  const router = useRouter();

  const {
    cart, payment, cashGiven, subtotal, discount, tax, total, change, cashShort,
    customerName, currencySymbol, fmt, saving, saleError, completedSale,
    setPayment, setCashGiven, completeSale, startNewSale,
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
            router.replace("/pos");
          }}
        />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center py-24 text-center px-6">
        <ShoppingBasket size={30} className="text-muted/40 mb-2" />
        <p className="text-[13px] text-muted">Nothing to pay</p>
        <Link href="/pos" className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
          Start a sale
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border flex items-center gap-2 px-3 py-3">
        <Link
          href="/pos"
          className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-foreground/70"
          aria-label="Back to products"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-[15px] font-bold text-foreground">Payment</h1>
      </header>

      <div className="flex-1 px-3 py-3 space-y-3">
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
          onPaymentChange={setPayment}
          onCashChange={setCashGiven}
          onCharge={completeSale}
        />
      </div>
    </div>
  );
}
