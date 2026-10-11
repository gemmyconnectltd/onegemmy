"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, FileText, Loader2, Mail, ShoppingCart } from "lucide-react";
import type { AiAction, AiActionResult } from "@/lib/api";
import { useCancelAiAction, useConfirmAiAction } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

const KIND: Record<AiAction["kind"], { icon: typeof FileText; open: string; times: boolean }> = {
  purchase_order: { icon: ShoppingCart, open: "Open purchase order", times: true },
  invoice: { icon: FileText, open: "Open invoice", times: true },
  payment_reminder: { icon: Mail, open: "Open", times: false },
};

/**
 * A draft awaiting the user's decision, shown as a compact document: title + status, a stacked line list
 * (name, "qty × price", right-aligned total) that never breaks on narrow drawers, and one clear action.
 * NOTHING exists in Pesaa (or is sent) until "Confirm" is pressed.
 */
export function AiActionCard({ action, onNavigate }: { action: AiAction; onNavigate: () => void }) {
  const confirm = useConfirmAiAction();
  const cancel = useCancelAiAction();
  const [state, setState] = useState<"pending" | "done" | "cancelled">(action.status === "pending" ? "pending" : action.status === "confirmed" ? "done" : "cancelled");
  const [result, setResult] = useState<AiActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = KIND[action.kind] ?? KIND.invoice;
  const Icon = meta.icon;

  const doConfirm = async () => {
    setError(null);
    try {
      setResult((await confirm.mutateAsync(action.id)).data);
      setState("done");
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Couldn't complete that. Please try again.");
    }
  };

  const badge = state === "done" ? { text: "Created", cls: "text-emerald-700 dark:text-emerald-400" }
    : state === "cancelled" ? { text: "Discarded", cls: "text-muted" } : { text: "Draft", cls: "text-amber-700 dark:text-amber-400" };

  return (
    <div className="mt-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Icon size={15} className="flex-shrink-0 text-accent" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{action.title}</p>
        <span className={cn("flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold", badge.cls)}>
          {state === "done" && <Check size={12} />}{badge.text}
        </span>
      </div>
      <p className="px-3 pt-0.5 text-[11.5px] leading-snug text-muted">{action.summary}</p>

      {action.message && (
        <pre className="mx-3 mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-2.5 font-sans text-[11.5px] leading-relaxed text-foreground">{action.message}</pre>
      )}

      {action.rows.length > 0 && (
        <ul className="mx-3 mt-2 divide-y divide-border/70 border-y border-border/70">
          {action.rows.map((r, i) => {
            const name = String(r[0] ?? "");
            const total = r.length > 1 ? String(r[r.length - 1]) : "";
            const detail = r.slice(1, -1).map(String).join(meta.times ? " × " : " · ");
            return (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-[12px]">
                <span className="min-w-0">
                  <span className="line-clamp-2 break-words font-medium text-foreground">{name}</span>
                  {detail && <span className="block truncate text-[11px] tabular-nums text-muted">{detail}</span>}
                </span>
                {total && <span className="flex-shrink-0 whitespace-nowrap font-semibold tabular-nums text-foreground">{total}</span>}
              </li>
            );
          })}
          <li className="flex items-baseline justify-between gap-3 py-1.5 text-[12px] font-semibold text-foreground">
            <span>Total</span><span className="whitespace-nowrap tabular-nums">{action.total}</span>
          </li>
        </ul>
      )}

      {action.warnings.map((w) => <p key={w} className="px-3 pt-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">⚠ {w}</p>)}

      <div className="flex items-center gap-1.5 px-3 py-2.5">
        {state === "pending" && (
          <>
            <button type="button" onClick={doConfirm} disabled={confirm.isPending}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {confirm.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {action.confirm_label}
            </button>
            <button type="button" onClick={() => { cancel.mutate(action.id); setState("cancelled"); }} disabled={confirm.isPending}
              className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted hover:text-foreground">Discard</button>
          </>
        )}
        {state === "done" && (
          <>
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{result?.message ?? "Done."}</span>
            {result && <Link href={result.href} onClick={onNavigate} className="flex-shrink-0 text-[12px] font-semibold text-accent hover:underline">{meta.open} →</Link>}
          </>
        )}
        {state === "cancelled" && <span className="text-[12px] text-muted">Nothing was saved or sent.</span>}
      </div>
      {error && <p className="px-3 pb-2.5 text-[12px] font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
}
