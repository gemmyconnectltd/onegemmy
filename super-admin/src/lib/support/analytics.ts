// DEMO ANALYTICS. The conversation counts come from the sample conversations; every time and volume figure is
// generated (deterministically, so it doesn't flicker). None of it is a real Pesaa metric.
import type { AnalyticsPoint, ChannelKind, SupportAnalytics, SupportState } from "./types";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AnalyticsRange = 7 | 30 | 90;

export function buildAnalytics(state: SupportState, days: AnalyticsRange, channel: "all" | ChannelKind): SupportAnalytics {
  const rand = rng(days * 131 + (channel === "all" ? 1 : channel === "email" ? 2 : 3));
  const weekly = days === 90;
  const buckets = weekly ? 13 : days;
  const series: AnalyticsPoint[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * (weekly ? 7 : 1) * 86_400_000);
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const scale = weekly ? 6 : 1;
    series.push({
      label,
      email: channel === "whatsapp" ? 0 : Math.round((4 + rand() * 10) * scale),
      whatsapp: channel === "email" ? 0 : Math.round((6 + rand() * 14) * scale),
    });
  }
  const email = series.reduce((s, p) => s + p.email, 0);
  const whatsapp = series.reduce((s, p) => s + p.whatsapp, 0);

  const convs = state.conversations.filter((c) => channel === "all" || c.channel === channel);
  const open = convs.filter((c) => c.status === "open" || c.status === "pending" || c.status === "snoozed").length;
  const resolved = convs.filter((c) => c.status === "resolved").length;

  const agents = state.agents.map((a) => {
    const mine = convs.filter((c) => c.assigneeId === a.id);
    return {
      agentId: a.id, name: a.name, handled: mine.length, resolved: mine.filter((c) => c.status === "resolved").length,
      avgFirstResponseMin: Math.round(6 + rand() * 24), avgResolutionHours: Math.round((2 + rand() * 9) * 10) / 10, satisfaction: null,
    };
  });

  return {
    totals: { total: convs.length, open, resolved },
    firstResponseMin: Math.round(9 + rand() * 12),
    resolutionHours: Math.round((4 + rand() * 5) * 10) / 10,
    byChannel: { email, whatsapp },
    series,
    agents,
    satisfaction: null,
  };
}
