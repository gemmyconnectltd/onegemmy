"use client";

import { useState } from "react";
import { PackageX } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { Toggle } from "@/components/mobile/Toggle";
import { loadMobileSettings, saveMobileSettings } from "@/lib/mobileSettings";

export default function MobileNotificationsPage() {
  const [lowStock, setLowStock] = useState<boolean>(() => loadMobileSettings().notifyLowStock);
  const [daily, setDaily] = useState<boolean>(() => loadMobileSettings().notifyDaily);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Notifications" subtitle="Alerts & daily summaries" />
      <div className="flex-1 px-4 pt-4 space-y-3">
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Low stock alerts</p>
              <p className="text-[10px] text-muted mt-0.5">Alert when an item runs low</p>
            </div>
            <Toggle on={lowStock} onChange={(v) => { setLowStock(v); saveMobileSettings({ notifyLowStock: v }); }} />
          </div>
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Daily summary</p>
              <p className="text-[10px] text-muted mt-0.5">End-of-day sales summary</p>
            </div>
            <Toggle on={daily} onChange={(v) => { setDaily(v); saveMobileSettings({ notifyDaily: v }); }} />
          </div>
        </div>

        <div className="flex items-start gap-2 px-1">
          <PackageX size={14} className="text-muted mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-muted leading-relaxed">
            Low stock alerts also appear on your Home screen bell icon so you never miss a restock.
          </p>
        </div>
      </div>
    </div>
  );
}
