"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FinancialError } from "@/components/accounting/FinancialShared";
import type { DebtPayment, DebtPaymentInput, DebtRecord } from "@/lib/debts";
import { DebtDrawer } from "./DebtDrawer";
import { DebtBadge, debtDate, useDebtMoney } from "./DebtShared";
import { DebtPaymentForm } from "./DebtPaymentForm";

export type { DebtPayment } from "@/lib/debts";

interface DebtDetailsProps {
  record: DebtRecord;
  payments: DebtPayment[];
  onClose: () => void;
  onRecord: (input: DebtPaymentInput) => Promise<void>;
  canPay: boolean;
  historyError?: unknown;
  supplierMetadataSupported?: boolean;
  historyFooter?: ReactNode;
}

export function DebtDetails({
  record, payments, onClose, onRecord, canPay, historyError,
  supplierMetadataSupported = false, historyFooter,
}: DebtDetailsProps) {
  const money = useDebtMoney();
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const party = record.kind === "receivable" ? "Customer" : "Supplier";
  const initials = record.name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const tabs = ["overview", "history"] as const;

  async function recordPayment(input: DebtPaymentInput) {
    setBusy(true);
    try { await onRecord(input); setPaying(false); }
    finally { setBusy(false); }
  }

  return (
    <DebtDrawer open size="lg" onClose={() => { if (!busy) onClose(); }}
      title={paying ? `Record ${party.toLowerCase()} payment` : `${party} debt details`}
      description={record.kind === "receivable" ? "Customer receivable" : "Supplier payable"}>
      <div className="space-y-5 p-5">
        {paying ? (
          <DebtPaymentForm record={record} onRecord={recordPayment}
            onCancel={() => setPaying(false)} supplierMetadataSupported={supplierMetadataSupported} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{initials}</span>
                <div className="min-w-0"><h2 className="text-sm font-semibold">{record.name}</h2><p className="mt-1 text-[11px] text-muted">{party} · {record.kind === "receivable" ? "Credit sale" : "Credit purchase"}</p></div>
              </div>
              <DebtBadge record={record} />
            </div>

            <div role="tablist" aria-label="Debt details" className="flex border-b border-border"
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === "overview" ? 1 : 0;
                setTab(tabs[next]);
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}>
              {tabs.map(value => <button key={value} type="button" role="tab"
                id={`debt-${record.id}-${value}-tab`} aria-controls={`debt-${record.id}-${value}`}
                aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                className={`flex-1 border-b-2 px-3 py-3 text-xs font-semibold ${tab === value ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>
                {value === "overview" ? "Overview" : "Payment History"}
              </button>)}
            </div>

            {tab === "overview" ? (
              <section role="tabpanel" tabIndex={0} id={`debt-${record.id}-overview`}
                aria-labelledby={`debt-${record.id}-overview-tab`} className="space-y-5 outline-offset-4">
                <dl className="divide-y divide-border rounded-xl border border-border bg-card px-4">
                  <div className="py-3"><dt className="text-[11px] text-muted">Invoice / reference</dt><dd className="mt-1 text-xs font-medium">{record.reference}</dd></div>
                  {[
                    { label: "Original amount", amount: record.original, color: "" },
                    { label: "Paid amount", amount: record.paid, color: "text-accent" },
                    { label: "Outstanding", amount: record.outstanding, color: "text-amber-600" },
                  ].map(item => <div key={item.label} className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-xs text-muted">{item.label}</dt><dd className={`text-sm font-semibold tabular-nums ${item.color}`}>{money(item.amount, record.currency)}</dd></div>)}
                </dl>
                <dl className="grid grid-cols-2 gap-4 text-xs">
                  <div><dt className="text-muted">Issue date</dt><dd className="mt-1.5 font-medium">{record.issue_date ? debtDate(record.issue_date) : "Not specified"}</dd></div>
                  <div><dt className="text-muted">Due date</dt><dd className={`mt-1.5 font-medium ${record.is_overdue ? "text-red-600" : ""}`}>{debtDate(record.due_date)}</dd></div>
                </dl>
              </section>
            ) : (
              <section role="tabpanel" tabIndex={0} id={`debt-${record.id}-history`}
                aria-labelledby={`debt-${record.id}-history-tab`} className="outline-offset-4">
                <h3 className="mb-3 text-sm font-semibold">Payment history</h3>
                <FinancialError error={historyError} />
                {!historyError && (payments.length ? (
                  <ul className="divide-y divide-border">
                    {payments.map(payment => <li key={payment.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="break-all text-xs font-semibold">{payment.display_reference || payment.reference}</p><p className="mt-1 text-[11px] text-muted">{debtDate(payment.paid_at)} · {payment.payment_method || "Not specified"}</p>{payment.reference_number && <p className="mt-1 text-[11px] text-muted">Reference: {payment.reference_number}</p>}{payment.actor && <p className="mt-1 text-[11px] text-muted">Recorded by {payment.actor}</p>}</div>
                        <div className="shrink-0 text-right"><p className={`text-xs font-semibold tabular-nums ${payment.status === "Reversed" ? "text-muted line-through" : ""}`}>{money(payment.amount, payment.currency)}</p>{payment.status === "Reversed" && <span className="text-[10px] text-red-600">Reversed</span>}</div>
                      </div>
                      {payment.notes && <p className="mt-2 break-words text-xs text-muted">{payment.notes}</p>}
                    </li>)}
                  </ul>
                ) : <p className="rounded-lg border border-dashed border-border px-4 py-7 text-center text-xs text-muted">No payments have been recorded.</p>)}
                {historyFooter}
              </section>
            )}
            {canPay && record.status !== "Paid" && <div className="border-t border-border pt-4"><Button className="w-full" onClick={() => setPaying(true)}>Record payment</Button></div>}
          </>
        )}
      </div>
    </DebtDrawer>
  );
}
