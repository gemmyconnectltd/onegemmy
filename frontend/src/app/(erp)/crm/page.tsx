"use client";
import { fmtMoney } from "@/lib/config";
import { useMemo } from "react";
import Link from "next/link";
import { TrendingUp, Users, Target, CheckCircle2, Plus } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useCustomers, useDeals } from "@/lib/api/hooks";

const PIPELINE_ORDER = ["Leads", "Qualified", "Proposal", "Negotiation", "Closed Won"];

export default function CRMPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const dealsQ = useDeals(1, 500);
  const customersQ = useCustomers(1, 200);

  const deals = useMemo(() => dealsQ.data?.items ?? [], [dealsQ.data]);
  const customers = useMemo(() => customersQ.data?.items ?? [], [customersQ.data]);

  const pipeline = useMemo(() => {
    const stages = new Map<string, { stage: string; count: number; value: number }>();
    for (const d of deals) {
      const s = stages.get(d.stage) ?? { stage: d.stage, count: 0, value: 0 };
      s.count += 1;
      s.value += d.value;
      stages.set(d.stage, s);
    }
    const known = PIPELINE_ORDER.filter((st) => stages.has(st)).map((st) => stages.get(st)!);
    const other = [...stages.keys()].filter((st) => !PIPELINE_ORDER.includes(st)).map((st) => stages.get(st)!);
    return [...known, ...other].sort((a, b) => b.value - a.value);
  }, [deals]);

  const closedWon = deals.filter((d) => d.stage === "Closed Won");
  const openValue = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost").reduce((s, d) => s + d.value, 0);

  const stats = [
    { label: "Total Leads",    value: String(deals.length),     icon: Users,      color: "#6f1a07" },
    { label: "Open Pipeline",  value: fmt(openValue),           icon: TrendingUp, color: "#10B981" },
    { label: "Closed Won",     value: String(closedWon.length), icon: Target,     color: "#3b82f6" },
    { label: "Customers",      value: String(customers.length), icon: CheckCircle2, color: "#af9164" },
  ];

  const loading = dealsQ.isLoading || customersQ.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">CRM Overview</h1>
        <div className="flex items-center gap-2">
          <Link href="/customers" className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-medium hover:bg-surface transition-colors">
            <Plus size={16} />Add Customer
          </Link>
          <Link href="/crm/contacts" className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90">
            <Plus size={16} />New Deal
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}10` }}><s.icon size={16} style={{ color: s.color }} /></div>
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-sm font-bold text-foreground">Pipeline Stages</h2></div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-muted">Loading pipeline…</p>
        ) : pipeline.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No deals yet — create one to start tracking your pipeline.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
