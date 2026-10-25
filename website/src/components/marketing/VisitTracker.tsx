"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { appUrl } from "@/lib/site";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const ID_KEY = "pesaa_vid";

/** Random per-browser id. It identifies no one; it only lets a later registration be matched to these page views. */
function visitorId(): string {
  try {
    const existing = localStorage.getItem(ID_KEY);
    if (existing && /^[A-Za-z0-9-]{16,64}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const trackingDisabled = () => navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

/** Anonymous page-view beacon + visitor id hand-off to the registration link. Honors Do Not Track / Global Privacy Control. */
export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (trackingDisabled()) return;
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      visitor_id: visitorId(),
      path: pathname,
      referrer: document.referrer || undefined,
      utm_source: params.get("utm_source") || undefined,
      utm_medium: params.get("utm_medium") || undefined,
      utm_campaign: params.get("utm_campaign") || undefined,
    });
    fetch(`${API_BASE}/public/visits`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (trackingDisabled()) return;
    const registerPath = new URL(appUrl("/register"), window.location.href);
    // Add the visitor id to links that lead to registration, just before the browser follows them.
    const tag = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === registerPath.origin && url.pathname === registerPath.pathname && !url.searchParams.has("vid")) {
        url.searchParams.set("vid", visitorId());
        link.href = url.toString();
      }
    };
    document.addEventListener("pointerdown", tag, true);
    document.addEventListener("keydown", tag, true);
    return () => {
      document.removeEventListener("pointerdown", tag, true);
      document.removeEventListener("keydown", tag, true);
    };
  }, []);

  return null;
}
