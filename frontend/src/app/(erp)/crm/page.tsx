"use client";
import { LayoutDashboard, TrendingUp, Users, Mail, Target } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const pipeline = [
  { stage: "Leads",       count: 24, value: 480000 },
  { stage: "Qualified",   count: 18, value: 720000 },
  { stage: "Proposal",    count: 12, value: 960000 },
  { stage: "Negotiation", count: 8,  value: 640000 },
  { stage: "Closed Won",  count: 15, value: 1800000 },
];

export default function CRMPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">CRM Overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Leads",    value: "68",      icon: Users,         color: "#6f1a07" },
          { label: "Pipeline Value", value: fmt(4600000), icon: TrendingUp, color: "#10B981" },
          { label: "Closed Won",     value: "15",      icon: Target,        color: "#3b82f6" },
          { label: "Emails Sent",    value: "142",     icon: Mail,          color: "#af9164" },
        ].map((s) => (
          <div key={s.label} className="bg-card border-y border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}15` }}><s.icon size={16} style={{ color: s.color }} /></div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-sm font-bold text-foreground">Pipeline Stages</h2></div>
        <div className="divide-y divide-border">
          {pipeline.map((p) => (
            <div key={p.stage} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{p.count}</span>
                <span className="text-sm font-medium text-foreground">{p.stage}</span>
              </div>
              <span className="text-sm font-bold text-foreground">{fmt(p.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
