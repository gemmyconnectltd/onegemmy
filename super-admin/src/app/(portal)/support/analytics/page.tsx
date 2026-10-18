"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock, FlaskConical, Inbox, MessageSquare, Smile, Timer } from "lucide-react";
import { SupportPageHeader } from "@/components/support/SupportPageHeader";
import { VolumeChart } from "@/components/support/VolumeChart";
import { DonutChart } from "@/components/charts/lazy";
import { TableScroll } from "@/components/ui/TableScroll";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { buildAnalytics, type AnalyticsRange } from "@/lib/support/analytics";
import { useSupport } from "@/lib/support/store";
import type { ChannelKind } from "@/lib/support/types";
import { cn } from "@/lib/utils";

const EMAIL = "#0284c7";
const WHATSAPP = "#16a34a";

function Kpi({ icon: Icon, label, value, hint, demo }: { icon: typeof Inbox; label: string; value: string; hint?: string; demo?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={16} /></span>{demo && <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Demo</span>}</div>
      <p className="text-[22px] font-bold leading-tight tabular-nums">{value}</p>
      <p className="text-[12px] font-medium">{label}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export default function SupportAnalyticsPage() {
  const { data, loading } = useSupport();
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const [range, setRange] = useState<AnalyticsRange>(30);
  const [channel, setChannel] = useState<"all" | ChannelKind>("all");

  const a = useMemo(() => (data ? buildAnalytics(data, range, channel) : null), [data, range, channel]);
  const maxHandled = Math.max(1, ...(a?.agents.map((x) => x.handled) ?? [1]));
  const seg = "flex gap-0.5 rounded-lg bg-surface p-0.5";
  const segBtn = (on: boolean) => cn("rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors", on ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground");

  return (
    <div className="space-y-4">
      <SupportPageHeader title="Support analytics" description="Conversation volume, response times and team workload."
        actions={
          <>
            <div role="group" aria-label="Date range" className={seg}>{([7, 30, 90] as const).map((d) => <button key={d} type="button" aria-pressed={range === d} onClick={() => setRange(d)} className={segBtn(range === d)}>Last {d} days</button>)}</div>
            <div role="group" aria-label="Channel" className={seg}>{([["all", "All channels"], ["email", "Email"], ["whatsapp", "WhatsApp"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={channel === k} onClick={() => setChannel(k)} className={segBtn(channel === k)}>{l}</button>)}</div>
          </>
        } />

      <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-[12.5px] text-amber-800 dark:text-amber-300"><FlaskConical size={14} className="mt-0.5 flex-shrink-0" /><span><strong>Demo analytics.</strong> Conversation counts come from the sample conversations; times and volumes are generated. None of these are real Pesaa support metrics.</span></p>

      {loading || !a ? <div className="h-64 animate-pulse rounded-xl bg-surface/60" aria-busy="true" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={Inbox} label="Total conversations" value={String(a.totals.total)} hint="sample conversations" />
            <Kpi icon={MessageSquare} label="Open" value={String(a.totals.open)} hint="open, pending or snoozed" />
            <Kpi icon={CheckCircle2} label="Resolved" value={String(a.totals.resolved)} />
            <Kpi icon={Timer} label="First response time" value={`${a.firstResponseMin} min`} demo />
            <Kpi icon={Clock} label="Avg resolution time" value={`${a.resolutionHours} h`} demo />
            <Kpi icon={Smile} label="Customer satisfaction" value="No data" hint="No customer feedback collected yet" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2" aria-labelledby="vol-h">
              <div className="mb-3 flex items-center justify-between"><h2 id="vol-h" className="text-[14px] font-bold">Conversations over time</h2><span className="text-[11px] text-muted">{range === 90 ? "Weekly" : "Daily"} · demo data</span></div>
              <div className="h-64"><VolumeChart data={a.series} emailColor={EMAIL} whatsappColor={WHATSAPP} gridColor={c.grid} tickColor={c.tick} tooltipStyle={c.tooltip} /></div>
            </section>
            <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="ch-h">
              <h2 id="ch-h" className="mb-3 text-[14px] font-bold">Email vs WhatsApp</h2>
              {a.byChannel.email + a.byChannel.whatsapp === 0 ? <p className="py-10 text-center text-[12.5px] text-muted">No volume for this selection.</p> : (
                <div className="flex items-center gap-4">
                  <div className="h-32 w-32 flex-shrink-0"><DonutChart data={[{ name: "Email", value: a.byChannel.email }, { name: "WhatsApp", value: a.byChannel.whatsapp }].filter((d) => d.value > 0)} colors={a.byChannel.email && a.byChannel.whatsapp ? [EMAIL, WHATSAPP] : [a.byChannel.email ? EMAIL : WHATSAPP]} innerRadius={38} outerRadius={60} tooltipStyle={c.tooltip} /></div>
                  <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
                    <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EMAIL }} />Email <strong className="ml-auto tabular-nums">{a.byChannel.email}</strong></li>
                    <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WHATSAPP }} />WhatsApp <strong className="ml-auto tabular-nums">{a.byChannel.whatsapp}</strong></li>
                  </ul>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2" aria-labelledby="wl-h">
              <h2 id="wl-h" className="mb-3 text-[14px] font-bold">Agent workload</h2>
              <p className="mb-2 text-[11.5px] text-muted">Conversations currently assigned (sample data).</p>
              <ul className="space-y-2.5">{a.agents.map((g) => (
                <li key={g.agentId}><div className="mb-1 flex justify-between text-[12.5px]"><span className="truncate font-medium">{g.name}</span><span className="tabular-nums text-muted">{g.handled}</span></div><div className="h-2 overflow-hidden rounded-full bg-border/70"><div className="h-full rounded-full bg-accent" style={{ width: `${(g.handled / maxHandled) * 100}%` }} /></div></li>
              ))}</ul>
            </section>
            <section className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-3" aria-labelledby="perf-h">
              <h2 id="perf-h" className="flex items-center gap-1.5 px-4 pt-4 text-[14px] font-bold"><BarChart3 size={15} /> Agent performance</h2>
              <p className="px-4 pb-2 text-[11.5px] text-muted">Handled and resolved come from sample conversations; response and resolution times are demo values.</p>
              <TableScroll label="Agent performance">
                <table className="w-full min-w-[520px] text-left text-[12.5px]">
                  <thead><tr className="border-y border-border bg-surface text-[11px] uppercase tracking-wide text-muted"><th className="px-4 py-2 font-semibold">Agent</th><th className="px-2 py-2 font-semibold">Handled</th><th className="px-2 py-2 font-semibold">Resolved</th><th className="px-2 py-2 font-semibold">1st response</th><th className="px-2 py-2 font-semibold">Resolution</th><th className="px-4 py-2 font-semibold">CSAT</th></tr></thead>
                  <tbody className="divide-y divide-border">{a.agents.map((g) => <tr key={g.agentId}><td className="px-4 py-2.5 font-medium">{g.name}</td><td className="px-2 py-2.5 tabular-nums">{g.handled}</td><td className="px-2 py-2.5 tabular-nums">{g.resolved}</td><td className="px-2 py-2.5 tabular-nums text-muted">{g.avgFirstResponseMin} min</td><td className="px-2 py-2.5 tabular-nums text-muted">{g.avgResolutionHours} h</td><td className="px-4 py-2.5 text-muted">—</td></tr>)}</tbody>
                </table>
              </TableScroll>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
