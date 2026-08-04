"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { Toggle } from "@/components/mobile/Toggle";
import { TAX_RATE } from "@/components/pos/constants";
import { loadMobileSettings, saveMobileSettings } from "@/lib/mobileSettings";

export default function MobileTaxesPage() {
  const [taxOnReceipt, setTaxOnReceipt] = useState<boolean>(() => loadMobileSettings().taxOnReceipt);

  const setTax = (v: boolean) => {
    setTaxOnReceipt(v);
    saveMobileSettings({ taxOnReceipt: v });
  };

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Taxes" subtitle="VAT & receipts" />
      <div className="flex-1 px-4 pt-4 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
            <ReceiptText size={18} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground">VAT rate</p>
            <p className="text-[11px] text-muted mt-0.5">Standard rate applied to sales</p>
          </div>
          <span className="ml-auto text-[15px] font-bold text-foreground">{Math.round(TAX_RATE * 100)}%</span>
        </div>

        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Show VAT on receipt</p>
            <p className="text-[10px] text-muted mt-0.5">Print the tax line on every receipt</p>
          </div>
          <Toggle on={taxOnReceipt} onChange={setTax} />
        </div>

        <p className="text-[10px] text-muted px-1 leading-relaxed">
          The VAT rate is controlled by your accounting settings in the web dashboard. Changing the rate there updates
          every new transaction.
        </p>
      </div>
    </div>
  );
}
