"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Receipt } from "@/components/pos/Receipt";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";

export default function MobileReceiptPage() {
  const router = useRouter();
  const { completedSale, currencySymbol, fmt, startNewSale } = useMobilePos();

  useEffect(() => {
    if (!completedSale) router.replace("/");
  }, [completedSale, router]);

  if (!completedSale) return null;

  const handleNewSale = () => {
    startNewSale();
    router.replace("/pos");
  };

  return (
    <div className="min-h-full bg-card">
      <Receipt
        sale={completedSale}
        currencySymbol={currencySymbol}
        fmt={fmt}
        onNewSale={handleNewSale}
      />
    </div>
  );
}
