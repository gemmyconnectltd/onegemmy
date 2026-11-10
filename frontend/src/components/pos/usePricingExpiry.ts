"use client";
import { useEffect, useState } from "react";

/** Expired prices disappear immediately; refetch failure never leaves a guaranteed offer visible. */
export function usePricingExpiry(deadline: string | undefined, refresh: () => unknown) {
  const [expired, setExpired] = useState<string>();
  useEffect(() => {
    if (!deadline) return;
    const delay = Math.max(0, Date.parse(deadline) - Date.now());
    const timer = window.setTimeout(() => { setExpired(deadline); void refresh(); }, delay);
    return () => window.clearTimeout(timer);
  }, [deadline, refresh]);
  return !!deadline && expired === deadline;
}
