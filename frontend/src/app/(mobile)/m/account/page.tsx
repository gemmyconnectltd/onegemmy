"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Building2, ChevronRight, CreditCard, Download, LifeBuoy, LogOut, Moon,
  Printer, ReceiptText, Sun, UserRound,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useOrders, usePurchaseOrders } from "@/lib/api/hooks";

const SECTIONS = [
  { href: "/m/account/profile", label: "Business profile", desc: "Name, phone, address", icon: Building2 },
  { href: "/m/account/payments", label: "Payment methods", desc: "Cash, mobile, card", icon: CreditCard },
  { href: "/m/account/taxes", label: "Taxes", desc: "VAT & receipts", icon: ReceiptText },
  { href: "/m/account/printer", label: "Printer settings", desc: "Paper size, copies", icon: Printer },
  { href: "/m/account/notifications", label: "Notifications", desc: "Alerts & summaries", icon: Bell },
  { href: "/m/account/support", label: "Help & support", desc: "FAQ, contact & help", icon: LifeBuoy },
];

export default function MobileAccountPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useAppConfig();
  const ordersQ = useOrders(1, 500);
  const purchasesQ = usePurchaseOrders(undefined, 1, 200);

  const handleLogout = () => {
    logout();
    router.replace("/m/login");
  };

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tenant: user?.tenantName,
      sales: ordersQ.data?.items ?? [],
      purchases: purchasesQ.data?.items ?? [],
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

  const avatarInitial = (user?.name?.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Account</h1>
        <p className="text-[11px] text-muted mt-0.5">Your business &amp; settings</p>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* Profile card */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center text-[16px] font-bold flex-shrink-0">
              {avatarInitial}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-foreground truncate">{user?.name}</p>
              <p className="text-[11px] text-muted truncate">{user?.email}</p>
              <p className="text-[10px] text-muted mt-0.5 truncate capitalize">
                {user?.role} · {user?.tenantName ?? "OneGemmy"}
              </p>
            </div>
          </div>
        </div>

        {/* Business sections */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Manage business</p>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="flex items-center gap-3 px-4 py-3.5 active:bg-surface transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                  <s.icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">{s.label}</p>
                  <p className="text-[10px] text-muted mt-0.5">{s.desc}</p>
                </div>
                <ChevronRight size={15} className="text-muted flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Preferences</p>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-surface transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-accent flex-shrink-0">
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[13px] font-semibold text-foreground">Appearance</p>
                <p className="text-[10px] text-muted mt-0.5">
                  {theme === "dark" ? "Dark theme · tap for light" : "Light theme · tap for dark"}
                </p>
              </div>
              <ChevronRight size={15} className="text-muted flex-shrink-0" />
            </button>
            <button
              onClick={exportData}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-surface transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-accent flex-shrink-0">
                <Download size={16} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[13px] font-semibold text-foreground">Backup data</p>
                <p className="text-[10px] text-muted mt-0.5">Export sales &amp; purchases as JSON</p>
              </div>
              <ChevronRight size={15} className="text-muted flex-shrink-0" />
            </button>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-[13px] font-semibold text-red-500 active:bg-red-500/15 transition-colors"
        >
          <LogOut size={16} /> Logout
        </button>

        <p className="flex items-center justify-center gap-1 text-[10px] text-muted pb-2">
          <UserRound size={11} /> OneGemmy · Mobile ERP
        </p>
      </div>
    </div>
  );
}
