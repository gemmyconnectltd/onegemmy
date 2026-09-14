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
