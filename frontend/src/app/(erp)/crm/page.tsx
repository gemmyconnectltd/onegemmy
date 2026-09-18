"use client";
import { fmtMoney } from "@/lib/config";
import Link from "next/link";
import { TrendingUp, Users, Target, Handshake, Mail, Plus } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { useDeals } from "@/lib/api/hooks";
import { BreakdownCard, breakdownColors, groupSum } from "@/components/charts/BreakdownCard";
import { PageLoader } from "@/components/ui/PageLoader";

const STAGES = ["Leads", "Qualified", "Proposal", "Negotiation", "Closed Won"];
const STAGE_COLOR: Record<string, string> = {
  Leads: "#94a3b8", Qualified: "#3b82f6", Proposal: "#af9164",
  Negotiation: "#f59e0b", "Closed Won": "#10b981",
};

export default function CRMPage() {
  const { currencySymbol, theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const { data, isLoading } = useDeals(1, 200);
  const deals = data?.items ?? [];

  const openDeals = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
  const closedWon = deals.filter((d) => d.stage === "Closed Won");
  const pipelineValue = openDeals.reduce((s, d) => s + d.value, 0);
  const pipelineByStage = groupSum(deals, (d) => d.stage, (d) => d.value);

  const stats = [
    { label: "Total Leads",    value: String(deals.length),        icon: Users,      color: "#16a34a" },
    { label: "Pipeline Value", value: fmt(pipelineValue),          icon: TrendingUp, color: "#10B981" },
    { label: "Closed Won",     value: String(closedWon.length),    icon: Target,     color: "#3b82f6" },
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">CRM Overview</h1>
          <p className="text-sm text-muted mt-0.5">{deals.length} deals across all stages</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/crm/campaigns" className="flex items-center gap-2 border border-border px-4 py-2.5 text-sm font-semibold rounded-lg hover:bg-surface transition-colors">
            <Mail size={15} />New Campaign
          </Link>
          <Link href="/crm/contacts" className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-semibold rounded-lg hover:bg-accent/90 transition-colors">
            <Plus size={15} />Add Contact
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}10` }}><s.icon size={16} style={{ color: s.color }} /></div>
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <BreakdownCard
          title="Pipeline by Stage"
          sub="CRM · current"
          icon={Handshake}
          data={pipelineByStage}
          colors={breakdownColors(c)}
          tooltipStyle={c.tooltip}
          empty="No deals in the pipeline yet"
        />
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Pipeline Stages</h2>
            <Link href="/sales" className="text-[11px] font-bold text-accent hover:underline">View all deals</Link>
          </div>
          {deals.length === 0 ? (
            <p className="text-sm text-muted py-10 text-center">No deals yet — add one from the Sales page.</p>
          ) : (
            <div className="divide-y divide-border">
              {STAGES.map((stage) => {
                const stageDeals = deals.filter((d) => d.stage === stage);
                const value = stageDeals.reduce((s, d) => s + d.value, 0);
                return (
                  <div key={stage} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: STAGE_COLOR[stage] }}
                      >
                        {stageDeals.length}
                      </span>
                      <span className="text-sm font-medium text-foreground">{stage}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">{fmt(value)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
