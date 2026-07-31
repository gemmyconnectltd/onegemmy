"use client";

import { useState } from "react";
import { Bell, Mail, Smartphone, AlertTriangle, ShoppingCart, DollarSign, Package } from "lucide-react";

const C = "#4f46e5";

type NotifSetting = { id: string; label: string; desc: string; icon: React.ElementType; color: string; email: boolean; push: boolean };

const INITIAL: NotifSetting[] = [
  { id: "low_stock", label: "Low Stock Alerts",  desc: "Get notified when products fall below minimum stock", icon: Package,       color: "#f59e0b", email: true,  push: true  },
  { id: "new_order", label: "New Orders",         desc: "Receive alerts when a new order is placed",           icon: ShoppingCart,  color: "#0284c7", email: true,  push: false },
  { id: "payment",   label: "Payment Received",   desc: "Notify when a payment or invoice is settled",         icon: DollarSign,    color: "#10b981", email: false, push: true  },
  { id: "system",    label: "System Alerts",      desc: "Important system and security notifications",         icon: AlertTriangle, color: "#ef4444", email: true,  push: true  },
];

export default function NotificationsPage() {
  const [settings, setSettings] = useState<NotifSetting[]>(INITIAL);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string, channel: "email" | "push") =>
    setSettings((prev) => prev.map((s) => s.id === id ? { ...s, [channel]: !s[channel] } : s));

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Notifications</h1>
        <p className="text-sm text-muted mt-0.5">Choose how and when you receive notifications</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${C}15` }}>
              <Bell size={15} style={{ color: C }} />
            </div>
            <h2 className="text-sm font-bold text-foreground">Notification Preferences</h2>
          </div>
          <div className="flex items-center gap-6 text-[11px] font-semibold text-muted pr-1">
            <div className="flex items-center gap-1"><Mail size={12} /> Email</div>
            <div className="flex items-center gap-1"><Smartphone size={12} /> Push</div>
          </div>
        </div>
        <div className="divide-y divide-border">
          {settings.map((s) => (
            <div key={s.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0" style={{ backgroundColor: `${s.color}15` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.label}</p>
                  <p className="text-[11px] text-muted mt-0.5">{s.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                {(["email", "push"] as const).map((ch) => (
                  <button key={ch} onClick={() => toggle(s.id, ch)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${s[ch] ? "bg-emerald-500" : "bg-border"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${s[ch] ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave} className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors" style={{ backgroundColor: C }}>
        {saved ? "Saved!" : "Save Preferences"}
      </button>
    </div>
  );
}
