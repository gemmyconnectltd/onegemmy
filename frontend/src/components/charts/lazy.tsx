"use client";

// Lazy recharts wrappers.
//
// recharts is a large dependency (~150KB gzipped). Importing it statically
// from a page forces the whole library into that page's initial JS bundle.
// These `next/dynamic` wrappers code-split recharts into its own chunk that is
// fetched only when a chart actually renders, cutting initial JS on every
// chart page. All wrappers share the same underlying chunk, so loading cost is
// paid once per session.
import dynamic from "next/dynamic";
import type { CSSProperties, ComponentProps } from "react";
import type { Tooltip as RechartsTooltip } from "recharts";

// Only the outer wrapper gets a skeleton — inner chart elements (axes, bars,
// tooltips) must render `null` while loading so they never inject invalid DOM
// into the chart's SVG tree.
function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-lg bg-surface/60" aria-hidden />;
}

export const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false, loading: ChartSkeleton },
);

export const AreaChart = dynamic(
  () => import("recharts").then((m) => m.AreaChart),
  { ssr: false },
);

export const Area = dynamic(
  () => import("recharts").then((m) => m.Area),
  { ssr: false },
);

export const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false },
);

export const Bar = dynamic(
  () => import("recharts").then((m) => m.Bar),
  { ssr: false },
);

export const LineChart = dynamic(
  () => import("recharts").then((m) => m.LineChart),
  { ssr: false },
);

export const Line = dynamic(
  () => import("recharts").then((m) => m.Line),
  { ssr: false },
);

// Bars + a cumulative line together on two independent y-axes, bundled into
// one component for the same reason as DonutChart below: ComposedChart,
// Bar, Line, XAxis, YAxis etc. resolving from independent dynamic() imports
// at different times previously left Bar with no rectangles ever rendered
// (ComposedChart's first real commit found no matching yAxisId and never
// recovered on the late re-render) — bundling guarantees they mount together.
export interface TenantGrowthDatum { month: string; count: number; cumulative: number }
export const TenantGrowthChart = dynamic(
  () =>
    import("recharts").then((m) => {
      function Comp({
        data, barColor, lineColor, gridColor, tickColor, tooltipStyle,
        barLabel = "New signups", lineLabel = "Total tenants", formatValue,
      }: {
        data: TenantGrowthDatum[];
        barColor: string;
        lineColor: string;
        gridColor: string;
        tickColor: string;
        tooltipStyle?: CSSProperties;
        barLabel?: string;
        lineLabel?: string;
        /** Formats axis ticks and tooltip values (e.g. compact money). */
        formatValue?: (v: number) => string;
      }) {
        const tick = { fontSize: 12, fill: tickColor };
        return (
          <m.ResponsiveContainer width="100%" height="100%">
            <m.ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
              <m.CartesianGrid strokeDasharray="3 4" stroke={gridColor} strokeOpacity={0.8} vertical={false} />
              <m.XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} tickMargin={10}
                interval="preserveStartEnd" minTickGap={20} />
              <m.YAxis yAxisId="left" tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={40}
                tickMargin={6} tickFormatter={formatValue} />
              <m.YAxis yAxisId="right" orientation="right" tick={tick} axisLine={false} tickLine={false} allowDecimals={false}
                width={40} tickMargin={6} tickFormatter={formatValue} />
              <m.Tooltip
                contentStyle={{ padding: "8px 12px", boxShadow: "0 4px 14px rgba(0,0,0,0.08)", ...tooltipStyle }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ padding: 0 }}
                cursor={{ fill: `${barColor}18` }}
                formatter={formatValue ? (v) => formatValue(Number(v)) : undefined}
              />
              <m.Bar yAxisId="left" dataKey="count" name={barLabel} fill={barColor} fillOpacity={0.85}
                radius={[6, 6, 0, 0]} maxBarSize={40} />
              <m.Line yAxisId="right" type="monotone" dataKey="cumulative" name={lineLabel}
                stroke={lineColor} strokeWidth={2.5}
                dot={data.length <= 31 ? { r: 4, fill: lineColor, stroke: "#fff", strokeWidth: 2 } : false}
                activeDot={{ r: 6, fill: lineColor, stroke: "#fff", strokeWidth: 2 }} />
            </m.ComposedChart>
          </m.ResponsiveContainer>
        );
      }
      return Comp;
    }),
  { ssr: false, loading: ChartSkeleton },
);

// Pie/Cell/PieChart are loaded together as one component, not as separate
// dynamic() wrappers like the others above. Recharts' <Pie> reads its slice
// colors from <Cell> children at the moment it renders; if Pie and Cell
// resolved from independent dynamic imports at slightly different times,
// Pie would commit its first real render with no Cell children yet (they're
// still `null` while loading) and permanently fall back to its default grey
// fill. Bundling them in a single dynamic import guarantees they mount
// together in the same pass.
export interface DonutDatum { name: string; value: number }
export const DonutChart = dynamic(
  () =>
    import("recharts").then((m) => {
      function Comp({
        data, colors, innerRadius = 32, outerRadius = 52,
        tooltipStyle, tooltipFormatter,
      }: {
        data: DonutDatum[];
        colors: string[];
        innerRadius?: number;
        outerRadius?: number;
        tooltipStyle?: CSSProperties;
        tooltipFormatter?: ComponentProps<typeof RechartsTooltip>["formatter"];
      }) {
        return (
          <m.ResponsiveContainer width="100%" height="100%">
            <m.PieChart>
              <m.Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((d, i) => (
                  <m.Cell key={d.name} fill={colors[i % colors.length]} />
                ))}
              </m.Pie>
              <m.Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
            </m.PieChart>
          </m.ResponsiveContainer>
        );
      }
      return Comp;
    }),
  { ssr: false, loading: ChartSkeleton },
);

export const XAxis = dynamic(
  () => import("recharts").then((m) => m.XAxis),
  { ssr: false },
);

export const YAxis = dynamic(
  () => import("recharts").then((m) => m.YAxis),
  { ssr: false },
);

export const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false },
);

export const Tooltip = dynamic(
  () => import("recharts").then((m) => m.Tooltip),
  { ssr: false },
);

export const Legend = dynamic(
  () => import("recharts").then((m) => m.Legend),
  { ssr: false },
);
