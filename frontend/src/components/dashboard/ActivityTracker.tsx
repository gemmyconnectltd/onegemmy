"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { request } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

const SESSION_KEY = "pesaa_activity_session";
const IDLE_MS = 30 * 60 * 1000;

/** Random per-tab id that rotates after 30 minutes without a page view. Holds no personal data. */
function sessionId(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const saved = raw ? (JSON.parse(raw) as { id: string; at: number }) : null;
    const id = saved && Date.now() - saved.at < IDLE_MS ? saved.id : crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: Date.now() }));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Reports each page view to the platform's usage analytics (module + time only — no content, names or query strings). */
export function ActivityTracker() {
  const { user } = useAuth();
  const pathname = usePathname();
  const last = useRef("");

  useEffect(() => {
    if (!user || document.visibilityState !== "visible") return;
    const key = `${user.id}|${pathname}`;
    if (last.current === key) return;
    last.current = key;
    request("/activity", { method: "POST", body: JSON.stringify({ session_id: sessionId(), path: pathname }) }).catch(() => {});
  }, [user, pathname]);

  return null;
}
