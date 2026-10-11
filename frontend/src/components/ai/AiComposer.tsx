"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import type { AiStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Small, unobtrusive usage line; the full numbers live in the tooltip. Warns only when it matters. */
function Usage({ status }: { status: AiStatus | undefined }) {
  if (!status) return <span />;
  const { remaining, monthly_limit: limit } = status;
  const low = remaining <= Math.max(5, Math.round(limit * 0.1));
  const text = remaining <= 0 ? "Monthly AI limit reached" : low ? `AI Usage · only ${remaining} left this month` : `AI Usage · ${remaining} remaining`;
  return (
    <span title={`${limit - remaining} of ${limit} AI requests used this month. The allowance resets monthly.`}
      className={cn("text-[10px]", remaining <= 0 ? "font-semibold text-red-600 dark:text-red-400" : low ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted/70")}>
      {text}
    </span>
  );
}

export function AiComposer({
  value, onChange, onSend, pending, disabled, placeholder, status, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  disabled: boolean;
  placeholder: string;
  status: AiStatus | undefined;
  autoFocus: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to ~5 lines, then scroll inside the box.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const canSend = value.trim().length > 0 && !pending && !disabled;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }} className="bg-card px-3.5 pb-2.5 pt-1">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-card py-1.5 pl-3.5 pr-1.5 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <textarea
          ref={ref} style={{ outline: "none" }} value={value} rows={1} maxLength={2000} disabled={disabled} aria-label="Message Pesaa AI" enterKeyHint="send"
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) onSend(); } }}
          className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-[13.5px] leading-snug text-foreground placeholder:text-muted/70 disabled:opacity-50"
        />
        <button type="submit" disabled={!canSend} aria-label="Send message"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white transition-all hover:opacity-90 active:scale-95 disabled:bg-border/70 disabled:text-muted">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2 px-1">
        <Usage status={status} />
      </div>
    </form>
  );
}
