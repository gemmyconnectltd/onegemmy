"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Receipt } from "@/components/pos/Receipt";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useAppConfig } from "@/lib/appConfig";

export default function MobileReceiptPage() {
  const router = useRouter();
  const { completedSale, currencySymbol, fmt, startNewSale } = useMobilePos();
  const { vatEnabled } = useAppConfig();

  useEffect(() => {
    if (!completedSale) router.replace("/m");
  }, [completedSale, router]);

  if (!completedSale) return null;

  const handleNewSale = () => {
    startNewSale();
    router.replace("/m/pos");
  };

  return (
    <div className="min-h-full bg-card">
      <Receipt
        sale={completedSale}
        currencySymbol={currencySymbol}
        fmt={fmt}
        onNewSale={handleNewSale}
        onClose={handleNewSale}
        vatEnabled={vatEnabled}
      />
    </div>
  );
}
