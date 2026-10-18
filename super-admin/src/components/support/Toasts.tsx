"use client";

import { useCallback, useState } from "react";
import { Bell, X } from "lucide-react";
import type { SupportEvent } from "@/lib/support/stream";

export interface Toast { id: number; title: string; tone: "info" | "alert" }

const TEXT: Record<string, (e: SupportEvent) => Toast["title"] | null> = {
  "conversation.new": (e) => `New ${e.channel === "whatsapp" ? "WhatsApp" : e.channel === "email" ? "email" : "support"} conversation`,
  "customer.replied": () => "A customer replied to your conversation",
  "ticket.assigned": (e) => `${e.reference ? `Ticket ${e.reference}` : "A conversation"} was assigned to you`,
  "ticket.urgent": (e) => `${e.priority === "urgent" ? "Urgent" : "High-priority"} ticket ${e.reference ?? ""}`.trim(),
  "whatsapp.disconnected": () => "WhatsApp disconnected — reconnect in Settings",
};

/** Only a handful of events are worth interrupting someone for; everything else just refreshes the screen. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const onEvent = useCallback((e: SupportEvent) => {
    const title = TEXT[e.type]?.(e);
    if (!title) return;
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, title, tone: e.type === "whatsapp.disconnected" || e.type === "ticket.urgent" ? "alert" : "info" }]);
    setTimeout(() => dismiss(id), 7000);
  }, [dismiss]);
  return { toasts, dismiss, onEvent };
}

export function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-16 z-50 flex w-[min(92vw,340px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={`pointer-events-auto flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5 text-[13px] shadow-lg ${t.tone === "alert" ? "border-red-500/40" : "border-border"}`}>
          <Bell size={14} className={`mt-0.5 flex-shrink-0 ${t.tone === "alert" ? "text-red-500" : "text-accent"}`} />
          <p className="min-w-0 flex-1 text-foreground">{t.title}</p>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-muted hover:text-foreground"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
