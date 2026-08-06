"use client";
import { useState } from "react";
import React from "react";
import { Settings, Shield, Bell, Globe, Key, Save, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sections: {
    icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
    color: string;
    title: string;
    desc: string;
    items: { label: string; type: string; value: boolean | number | string; options?: string[] }[];
  }[] = [
    {
      icon: Shield,
      color: "#8b5cf6",
      title: "Security",
      desc: "Platform-wide security settings",
      items: [
        { label: "Require 2FA for all admins", type: "toggle", value: false },
        { label: "Session timeout (minutes)", type: "number", value: 60 },
        { label: "Max login attempts", type: "number", value: 5 },
      ],
    },
    {
      icon: Bell,
      color: "#0284c7",
      title: "Notifications",
      desc: "System alert preferences",
      items: [
        { label: "Email alerts for new tenant signups", type: "toggle", value: true },
        { label: "Email alerts for suspended tenants", type: "toggle", value: true },
        { label: "Daily platform summary email", type: "toggle", value: false },
      ],
    },
    {
      icon: Globe,
      color: "#059669",
      title: "Platform",
      desc: "General platform configuration",
      items: [
        { label: "Allow public registration", type: "toggle", value: true },
        { label: "Maintenance mode", type: "toggle", value: false },
        { label: "Default tenant plan", type: "select", value: "free", options: ["free", "starter", "professional", "enterprise"] },
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted mt-0.5">Platform-wide configuration and preferences</p>
      </div>

      {/* Admin info */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() || "A"}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{user?.name}</p>
          <p className="text-[12px] text-muted">{user?.email}</p>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent mt-1 inline-block">SUPERADMIN</span>
        </div>
        <div className="ml-auto">
          <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-semibold">
            <CheckCircle size={13} /> Active Session
          </div>
        </div>
      </div>

      {/* Settings sections */}
      {sections.map((section) => (
        <div key={section.title} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 bg-surface/30">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${section.color}18` }}>
              <section.icon size={15} style={{ color: section.color }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{section.title}</h2>
              <p className="text-[11px] text-muted">{section.desc}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {section.items.map((item) => (
              <div key={item.label} className="px-5 py-4 flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-foreground">{item.label}</label>
                {item.type === "toggle" && (
                  <button
                    className={`relative w-10 h-5 rounded-full transition-colors ${item.value ? "bg-accent" : "bg-border"}`}
                    onClick={() => {}}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${item.value ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                )}
                {item.type === "number" && (
                  <input
                    type="number"
                    defaultValue={item.value as number}
                    className="w-24 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 text-right"
                  />
                )}
                {item.type === "select" && (
                  <select
                    defaultValue={item.value as string}
                    className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 capitalize"
                  >
                    {item.options?.map((o) => <option key={o} value={o} className="capitalize">{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* API Key section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 bg-surface/30">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Key size={15} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">API Access</h2>
            <p className="text-[11px] text-muted">Platform API configuration</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-[12px] text-muted mb-3">API documentation and keys are managed via the backend. Visit the API docs at:</p>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-semibold text-accent hover:underline font-mono"
          >
            http://localhost:8000/docs ↗
          </a>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          {saved ? <><CheckCircle size={15} /> Saved!</> : <><Save size={15} /> Save Changes</>}
        </button>
      </div>
    </div>
  );
}
