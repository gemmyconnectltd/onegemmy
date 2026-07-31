"use client";
import { CreditCard, Plus } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const accounts = [
  { id: 1, name: "Main Cash",      type: "Cash",   balance: 892000,  currency: "RWF" },
  { id: 2, name: "Bank - BK",      type: "Bank",   balance: 1450000, currency: "RWF" },
  { id: 3, name: "Mobile Money",   type: "MoMo",   balance: 234000,  currency: "RWF" },
  { id: 4, name: "Petty Cash",     type: "Cash",   balance: 50000,   currency: "RWF" },
];

export default function AccountsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-sm text-muted mt-1">Total balance: <span className="font-bold text-accent">{fmt(total)}</span></p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Add Account</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map((a) => (
          <div key={a.id} className="bg-white border border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 bg-accent/10 flex items-center justify-center"><CreditCard size={16} className="text-accent" /></div>
              <span className="text-xs font-medium text-muted bg-surface px-2 py-0.5">{a.type}</span>
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
