"use client";
import { fmtMoney } from "@/lib/config";
import { CreditCard, Plus } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const accounts = [
  { id: 1, name: "Main Cash",    type: "Cash", balance: 892000,  currency: "RWF" },
  { id: 2, name: "Bank - BK",    type: "Bank", balance: 1450000, currency: "RWF" },
  { id: 3, name: "Mobile Money", type: "MoMo", balance: 234000,  currency: "RWF" },
  { id: 4, name: "Petty Cash",   type: "Cash", balance: 50000,   currency: "RWF" },
];

export default function AccountsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Accounts</h1>
          <p className="text-sm text-muted mt-0.5">Total balance: <span className="font-bold text-accent">{fmt(total)}</span></p>
        </div>
        <button className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg" style={{ backgroundColor: "#b45309" }}>
          <Plus size={15} /> Add Account
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map((a) => (
          <div key={a.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-foreground/15 transition-all space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#b4530915" }}>
                <CreditCard size={18} style={{ color: "#b45309" }} />
              </div>
              <span className="text-xs font-semibold text-muted bg-surface px-2.5 py-1 rounded-full">{a.type}</span>
            </div>
            <div>
              <p className="text-lg font-extrabold text-foreground">{fmt(a.balance)}</p>
              <p className="text-sm text-muted mt-0.5">{a.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
