"use client";

import { Banknote, CreditCard, FileText, Smartphone } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { PAYMENT_METHODS } from "@/components/pos/constants";

const ICONS: Record<string, typeof Banknote> = {
  banknote: Banknote,
  smartphone: Smartphone,
  "credit-card": CreditCard,
  "file-text": FileText,
};

export default function MobilePaymentsPage() {
  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Payment methods" subtitle="Accepted at your register" />
      <div className="flex-1 px-4 pt-4 space-y-3">
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {PAYMENT_METHODS.map((m) => {
            const Icon = ICONS[m.icon] ?? Banknote;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">{m.label}</p>
                  <p className="text-[10px] text-muted mt-0.5 capitalize">{m.id}</p>
                </div>
                <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-bold uppercase tracking-wide">
                  Active
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted px-1 leading-relaxed">
          Choose a method during checkout on the Sales screen. Adding new methods is available in the web dashboard.
        </p>
      </div>
    </div>
  );
}
