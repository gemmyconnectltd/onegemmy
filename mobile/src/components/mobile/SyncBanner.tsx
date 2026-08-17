"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudUpload, RefreshCw, WifiOff } from "lucide-react";
import { getPendingOps, subscribePendingChanges } from "@/lib/offline";
import { syncPendingOps } from "@/lib/offlineSync";

const RETRY_INTERVAL_MS = 8000;

export default function SyncBanner() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const ops = await getPendingOps();
    setPending(ops.length);
  }, []);

  const sync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    const result = await syncPendingOps();
    setSyncing(false);
    if (result.failed > 0) setLastError(result.errors[0] ?? "Sync failed");
    else setLastError(null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    getPendingOps().then((ops) => {
      setPending(ops.length);
    });
    const unsubscribe = subscribePendingChanges(refresh);
    const onOnline = () => sync();
    window.addEventListener("online", onOnline);

    timerRef.current = setInterval(() => {
      getPendingOps().then((ops) => { if (ops.length > 0) sync(); });
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
            Offline — {pending} {pending === 1 ? "op" : "ops"} saved, will sync
          </>
        ) : syncing ? (
          <>
            <RefreshCw size={13} className="flex-shrink-0 animate-spin" />
            Syncing {pending} {pending === 1 ? "op" : "ops"}…
          </>
        ) : lastError ? (
          <>
            <AlertTriangle size={13} className="flex-shrink-0 text-yellow-300" />
            {pending} {pending === 1 ? "op" : "ops"} waiting — {lastError}
          </>
        ) : (
          <>
            <CloudUpload size={13} className="flex-shrink-0" />
            {pending} {pending === 1 ? "op" : "ops"} pending sync
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
