"use client";

import { useState } from "react";
import { Minus, Plus, Printer } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { Toggle } from "@/components/mobile/Toggle";
import { loadMobileSettings, saveMobileSettings } from "@/lib/mobileSettings";

export default function MobilePrinterPage() {
  const [width, setWidth] = useState<"80mm" | "58mm">(() => loadMobileSettings().receiptWidth);
  const [copies, setCopies] = useState(() => loadMobileSettings().receiptCopies);
  const [bluetooth, setBluetooth] = useState(() => loadMobileSettings().printerBluetooth);

  const set = (patch: Parameters<typeof saveMobileSettings>[0]) => saveMobileSettings(patch);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Printer settings" subtitle="Receipt printing" />
      <div className="flex-1 px-4 pt-4 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
            <Printer size={18} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground">Bluetooth printer</p>
            <p className="text-[10px] text-muted mt-0.5">Print receipts to a paired thermal printer</p>
          </div>
          <Toggle on={bluetooth} onChange={(v) => { setBluetooth(v); set({ printerBluetooth: v }); }} />
        </div>

        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Paper width</p>
          <div className="grid grid-cols-2 gap-2">
            {(["80mm", "58mm"] as const).map((w) => (
              <button
                key={w}
                onClick={() => { setWidth(w); set({ receiptWidth: w }); }}
                className={`py-3 rounded-2xl border text-[13px] font-semibold transition-colors ${
                  width === w
                    ? "bg-accent text-white border-accent"
                    : "bg-card border-border text-foreground"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Copies</p>
            <p className="text-[10px] text-muted mt-0.5">Receipts to print per sale</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { const n = Math.max(1, copies - 1); setCopies(n); set({ receiptCopies: n }); }}
              className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-foreground active:bg-muted/30"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-[14px] font-bold text-foreground">{copies}</span>
            <button
              onClick={() => { const n = Math.min(5, copies + 1); setCopies(n); set({ receiptCopies: n }); }}
              className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-foreground active:bg-muted/30"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
