"use client";

import { useEffect, useRef } from "react";

/**
 * Acquires a Screen Wake Lock while the page is visible.
 *
 * This prevents the device from dimming/sleeping while the user is actively
 * using the POS — critical on Android where battery-saver modes aggressively
 * throttle background tabs and service workers.
 *
 * The lock is automatically re-acquired after a visibility change (some
 * browsers release the lock when the tab is backgrounded) and released on
 * unmount.  Silently no-ops on browsers that don't support the API.
 */
export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        if (cancelled) return;
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release();
          return;
        }
        lockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          lockRef.current = null;
        });
      } catch {
        // Not supported or permission denied — silently ignore
      }
    }

    acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !lockRef.current) {
        acquire();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release();
      lockRef.current = null;
    };
  }, []);
}
