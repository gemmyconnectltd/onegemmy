"use client";

import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { useBilling } from "@/lib/billing/store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Always visible: billing runs on sample data until the billing API and a payment provider exist. */
export function BillingDemoBanner() {
  const { actions } = useBilling();
  const [confirm, setConfirm] = useState(false);
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-800 dark:text-amber-300 sm:px-3.5 sm:py-2 sm:text-[12.5px]">
      <FlaskConical size={15} className="flex-shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>Demo mode.</strong>{" "}
        <span className="sm:hidden">Sample data. No money moves.</span>
        <span className="hidden sm:inline">Sample data only. No charges, refunds or payments are made, and changes stay in this browser. Real billing needs the billing API and a payment provider.</span>
      </p>
      <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold underline-offset-2 hover:underline">
        <RotateCcw size={12} /> <span className="hidden sm:inline">Reset demo data</span><span className="sm:hidden">Reset</span>
      </button>
      <ConfirmDialog open={confirm} danger title="Reset demo data?" message="This restores the original sample plans, subscriptions, invoices and settings. Your demo changes in this browser will be lost." confirmLabel="Reset"
        onConfirm={() => { setConfirm(false); void actions.resetDemo(); }} onCancel={() => setConfirm(false)} />
    </div>
  );
}
