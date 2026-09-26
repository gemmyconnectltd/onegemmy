"use client";

import type { ComponentType } from "react";

import { DonutChart } from "@/components/charts/lazy";
import type { ChartPalette } from "@/lib/chartColors";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";

export type BreakdownDatum = { name: string; value: number };

/** Groups items by a key and sums a numeric value, sorted highest first. */
export function groupSum<T>(items: T[], keyFn: (item: T) => string, valueFn: (item: T) => number): BreakdownDatum[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + valueFn(item));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Standard 6-color rotation used across every donut breakdown card, for visual consistency. */
export function breakdownColors(c: ChartPalette): string[] {
  return [c.income, c.blue, c.gold, c.expenses, c.profit, c.gray];
}

/**
 * A donut chart + legend card summarizing one dataset by category — the shared
 * building block for "breakdown by X" widgets on the Dashboard and every
 * module's overview page, so they all look and behave the same way.
 */
export function BreakdownCard({
  title, sub, icon: Icon, data, colors, tooltipStyle, empty, loading,
}: {
  title: string;
  sub: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  data: BreakdownDatum[];
  colors: string[];
  tooltipStyle: ChartPalette["tooltip"];
  empty: string;
  loading?: boolean;
}) {
  const { currencySymbol } = useAppConfig();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Icon size={13} className="text-accent flex-shrink-0" />
          <h2 className="text-[13px] font-bold text-foreground truncate">{title}</h2>
        </div>
        <p className="text-[10.5px] text-muted mt-0.5">{sub}</p>
      </div>
      <div className="p-4 flex-1">
        {loading ? (
          <p className="px-2 py-8 text-[12px] text-muted text-center">Loading…</p>
        ) : total <= 0 ? (
          <p className="px-2 py-8 text-[12px] text-muted text-center">{empty}</p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-[84px] h-[84px] flex-shrink-0">
              <DonutChart
                data={data}
                colors={colors}
                innerRadius={26}
                outerRadius={42}
                tooltipStyle={tooltipStyle}
                tooltipFormatter={(v, n) => [fmtMoney(Number(v), currencySymbol), String(n)]}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              {data.slice(0, 4).map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                  <span className="text-[11px] text-foreground/80 truncate flex-1">{d.name}</span>
                  <span className="text-[10px] font-bold text-muted flex-shrink-0">{Math.round((d.value / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
