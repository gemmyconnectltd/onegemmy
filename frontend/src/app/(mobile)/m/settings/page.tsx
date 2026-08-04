"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight, Banknote, Bell, CreditCard, Download,
  FileText, LogOut, Package, ReceiptText, Smartphone, UserRound,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useAuth } from "@/lib/auth";
import { PAYMENT_METHODS, TAX_RATE } from "@/components/pos/constants";
import { getSales } from "@/lib/invoices";
import { getPurchases } from "@/lib/purchases";

const SETTINGS_KEY = "onegemmy.mobile.settings.v1";

interface MobileSettings {
  businessName: string;
  phone: string;
  taxOnReceipt: boolean;
  notifyLowStock: boolean;
  notifyDaily: boolean;
}

const DEFAULTS: MobileSettings = {
  businessName: "",
  phone: "",
  taxOnReceipt: true,
  notifyLowStock: true,
  notifyDaily: true,
};

function loadSettings(): MobileSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MobileSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  mobile: Smartphone,
  card: CreditCard,
  invoice: FileText,
};

export default function MobileSettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { currencySymbol } = useMobilePos();
  const [settings, setSettings] = useState<MobileSettings>(() => loadSettings());

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const set = <K extends keyof MobileSettings>(key: K, value: MobileSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleLogout = () => {
    logout();
    router.replace("/m/login");
  };

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tenant: user?.tenantName,
      sales: getSales(),
      purchases: getPurchases(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onegemmy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const localSales = getSales().length;
  const localPurchases = getPurchases().length;

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Settings</h1>
        <p className="text-[11px] text-muted mt-0.5">Your business & account</p>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* Account */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
              <UserRound size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-foreground truncate">{user?.name}</p>
              <p className="text-[11px] text-muted truncate">{user?.email}</p>
              <p className="text-[10px] text-muted mt-0.5 capitalize">
                {user?.role} · {user?.tenantName ?? "OneGemmy"}
              </p>
            </div>
          </div>
        </div>

        {/* Business profile */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Business Profile</p>
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-[10px] text-muted font-semibold block mb-1">Business name</label>
              <input
                value={settings.businessName || user?.tenantName || ""}
                onChange={(e) => set("businessName", e.target.value)}
                placeholder={user?.tenantName ?? "Business name"}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted font-semibold block mb-1">Phone</label>
              <input
                value={settings.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+250 7XX XXX XXX"
                className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        {/* Taxes */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Taxes</p>
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-foreground">VAT rate</p>
                <p className="text-[10px] text-muted mt-0.5">Applied to every sale</p>
              </div>
              <span className="text-[14px] font-bold font-mono text-accent">{Math.round(TAX_RATE * 100)}%</span>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Show tax on receipts</p>
                <p className="text-[10px] text-muted mt-0.5">Line item for VAT in the receipt</p>
              </div>
              <Toggle on={settings.taxOnReceipt} onChange={(v) => set("taxOnReceipt", v)} />
            </label>
          </div>
        </div>

        {/* Payment methods */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Payment Methods</p>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {PAYMENT_METHODS.map((m) => {
              const Icon = PAYMENT_ICONS[m.id] ?? Banknote;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon size={15} className="text-accent" />
                  <span className="text-[13px] font-medium text-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Notifications</p>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            <ToggleRow
              icon={Package}
              title="Low stock alerts"
              desc={`Warn when items run below threshold (${currencySymbol})`}
              on={settings.notifyLowStock}
              onChange={(v) => set("notifyLowStock", v)}
            />
            <ToggleRow
              icon={Bell}
              title="Daily summary"
              desc="End-of-day sales & profit recap"
              on={settings.notifyDaily}
              onChange={(v) => set("notifyDaily", v)}
            />
          </div>
        </div>

        {/* Backup */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Backup</p>
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex gap-4">
              <div>
                <p className="text-[16px] font-bold font-mono text-foreground">{localSales}</p>
                <p className="text-[10px] text-muted mt-0.5">Offline sales</p>
              </div>
              <div>
                <p className="text-[16px] font-bold font-mono text-foreground">{localPurchases}</p>
                <p className="text-[10px] text-muted mt-0.5">Purchases</p>
              </div>
            </div>
            <button
              onClick={exportData}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border text-[12px] font-semibold text-foreground active:bg-surface transition-colors"
            >
              <Download size={15} /> Export data (JSON)
            </button>
          </div>
        </div>

        {/* Links */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">In-app</p>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            <a href="/m/transactions" className="flex items-center gap-3 px-4 py-3.5 active:bg-surface transition-colors">
              <ArrowLeftRight size={15} className="text-accent" />
              <span className="text-[13px] font-medium text-foreground">Transactions</span>
            </a>
            <a href="/m/stats" className="flex items-center gap-3 px-4 py-3.5 active:bg-surface transition-colors">
              <ReceiptText size={15} className="text-accent" />
              <span className="text-[13px] font-medium text-foreground">Analytics</span>
            </a>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-[13px] font-semibold text-red-500 active:bg-red-500/15 transition-colors"
        >
          <LogOut size={16} /> Logout
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  desc,
  on,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
      <Icon size={15} className="text-accent flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-[10px] text-muted mt-0.5">{desc}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </label>
  );
}
