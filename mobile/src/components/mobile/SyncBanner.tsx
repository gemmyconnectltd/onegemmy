"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudUpload, RefreshCw, WifiOff } from "lucide-react";

import { useCreateOrder } from "@/lib/api/hooks";
import { getPendingOrders, removePendingOrder, subscribePendingChanges } from "@/lib/offline";

const RETRY_INTERVAL_MS = 8000;

export default function SyncBanner() {
  const createOrder = useCreateOrder();
  const [pending, setPending] = useState(() => getPendingOrders().length);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => setPending(getPendingOrders().length), []);

  const sync = useCallback(async () => {
    const orders = getPendingOrders();
    if (orders.length === 0 || typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    let ok = true;
    for (const order of orders) {
      try {
        await createOrder.mutateAsync(order.payload);
        removePendingOrder(order.clientOrderId);
      } catch (e) {
        ok = false;
        setLastError((e as { status?: number; detail?: string })?.detail ?? "Sync failed");
      }
    }
    setSyncing(false);
    refresh();
    return ok;
  }, [createOrder, refresh]);

  useEffect(() => {
    const unsubscribe = subscribePendingChanges(refresh);
    const onOnline = () => sync();
    window.addEventListener("online", onOnline);

    // While there are unsynced sales, retry periodically so the queue clears
    // on its own once the backend is reachable again.
    timerRef.current = setInterval(() => {
      if (getPendingOrders().length > 0) sync();
    }, RETRY_INTERVAL_MS);

    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, sync]);

  if (pending === 0) return null;

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[99] w-fit max-w-[398px]">
      <div className="flex items-center gap-2 pr-1.5 pl-3.5 py-1.5 rounded-full bg-foreground text-background text-xs font-medium shadow-lg shadow-black/20">
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
        ) : lastError ? (
          <>
            <AlertTriangle size={13} className="flex-shrink-0 text-yellow-300" />
            {pending} {pending === 1 ? "sale" : "sales"} waiting — server rejected
          </>
        ) : (
          <>
            <CloudUpload size={13} className="flex-shrink-0" />
            {pending} {pending === 1 ? "sale" : "sales"} pending sync
          </>
        )}
        {!offline && !syncing && (
          <button
            onClick={() => sync()}
            className="ml-1 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold active:scale-95 transition-transform"
          >
            Sync now
          </button>
        )}
      </div>
    </div>
  );
}
