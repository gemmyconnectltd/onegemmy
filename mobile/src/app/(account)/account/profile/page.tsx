"use client";

import { useState } from "react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { loadMobileSettings, saveMobileSettings, type MobileSettings } from "@/lib/mobileSettings";

export default function MobileBusinessProfilePage() {
  const [form, setForm] = useState<Pick<MobileSettings, "businessName" | "phone" | "address">>(() => {
    const s = loadMobileSettings();
    return { businessName: s.businessName, phone: s.phone, address: s.address };
  });
  const [saved, setSaved] = useState(false);

  const set = (key: keyof Pick<MobileSettings, "businessName" | "phone" | "address">, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveMobileSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Business profile" subtitle="Details shown on receipts" />
      <div className="flex-1 px-4 pt-4 space-y-3">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Business name</label>
            <input
              value={form.businessName}
              onChange={(e) => set("businessName", e.target.value)}
              placeholder="e.g. Kigali Mart"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+250 7XX XXX XXX"
              inputMode="tel"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted font-semibold block mb-1">Address</label>
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Street, district, city"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-2xl text-[13px] font-semibold transition-colors ${
            saved ? "bg-green-500/15 text-green-600 border border-green-500/40" : "bg-accent text-white"
          }`}
        >
          {saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
