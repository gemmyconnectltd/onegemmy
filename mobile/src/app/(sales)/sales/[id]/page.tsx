"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ReceiptText } from "lucide-react";

import { Receipt } from "@/components/pos/Receipt";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useOrders } from "@/lib/api/hooks";
import { orderToSale } from "@/lib/orders";
import { useAppConfig } from "@/lib/appConfig";

export default function MobileSalesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currencySymbol, fmt, startNewSale } = useMobilePos();
  const { vatEnabled } = useAppConfig();
  const ordersQ = useOrders(1, 500);

  const sale = useMemo(() => {
    const order = (ordersQ.data?.items ?? []).find(
      (o) => o.status === "Completed" && (o.order_number === id || o.id === id),
    );
    return order ? orderToSale(order) : null;
  }, [ordersQ.data, id]);

  if (!sale) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center text-center px-6">
        <ReceiptText size={30} className="text-muted/40 mb-2" />
        <p className="text-[13px] text-muted">Sale not found</p>
        <Link href="/sales" className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
          Back to sales
        </Link>
      </div>
    );
  }

  const handleNewSale = () => {
    startNewSale();
    router.replace("/pos");
  };

  return (
    <div className="min-h-full flex flex-col bg-card">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border flex items-center gap-2 px-3 py-3">
        <Link
          href="/sales"
          className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-foreground/70"
          aria-label="Back to sales"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-[15px] font-bold text-foreground">Receipt</h1>
      </header>
      <div className="flex-1">
        <Receipt sale={sale} currencySymbol={currencySymbol} fmt={fmt} onNewSale={handleNewSale} vatEnabled={vatEnabled} />
      </div>
    </div>
  );
}
