"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, RefreshCw, WifiOff } from "lucide-react";

import { useCreateOrder } from "@/lib/api/hooks";
import { getPendingOrders, removePendingOrder, subscribePendingChanges } from "@/lib/offline";

export default function SyncBanner() {
  const createOrder = useCreateOrder();
  const [pending, setPending] = useState(() => getPendingOrders().length);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setPending(getPendingOrders().length), []);

  const sync = useCallback(async () => {
    const orders = getPendingOrders();
    if (orders.length === 0) return;
    setSyncing(true);
    for (const order of orders) {
      try {
        await createOrder.mutateAsync(order.payload);
        removePendingOrder(order.clientOrderId);
      } catch {
        // Leave in the queue — retried on the next online event. Nothing is
        // dropped so no sale is silently lost.
      }
    }
    setSyncing(false);
    refresh();
  }, [createOrder, refresh]);

  useEffect(() => {
    const unsubscribe = subscribePendingChanges(refresh);
    const onOnline = () => sync();
    window.addEventListener("online", onOnline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, sync]);

  if (pending === 0) return null;

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[99] w-fit max-w-[398px]">
      <div
        className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium shadow-lg shadow-black/20 ${
          syncing ? "bg-primary text-primary-foreground" : "bg-foreground text-background"
        }`}
      >
        {offline ? (
          <>
            <WifiOff size={13} className="flex-shrink-0" />
            Offline — {pending} {pending === 1 ? "sale" : "sales"} saved, will sync
          </>
        ) : syncing ? (
          <>
            <RefreshCw size={13} className="flex-shrink-0 animate-spin" />
            Syncing {pending} {pending === 1 ? "sale" : "sales"}…
          </>
        ) : (
          <>
            <CloudUpload size={13} className="flex-shrink-0" />
            {pending} {pending === 1 ? "sale" : "sales"} pending sync — retrying
          </>
        )}
      </div>
    </div>
  );
}
