"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import type { AnalyticsPoint } from "@/lib/support/types";

// Same pattern as the other charts: recharts loads lazily, and every chart element mounts together in one component.
export const VolumeChart = dynamic(
  () =>
    import("recharts").then((m) => {
      function Comp({ data, emailColor, whatsappColor, gridColor, tickColor, tooltipStyle }: {
        data: AnalyticsPoint[]; emailColor: string; whatsappColor: string; gridColor: string; tickColor: string; tooltipStyle?: CSSProperties;
      }) {
        const tick = { fontSize: 12, fill: tickColor };
        return (
          <m.ResponsiveContainer width="100%" height="100%">
            <m.BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
              <m.CartesianGrid strokeDasharray="3 4" stroke={gridColor} vertical={false} />
              <m.XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={24} />
              <m.YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <m.Tooltip contentStyle={{ padding: "8px 12px", ...tooltipStyle }} cursor={{ fill: `${whatsappColor}14` }} />
              <m.Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <m.Bar dataKey="whatsapp" name="WhatsApp" stackId="v" fill={whatsappColor} maxBarSize={28} />
              <m.Bar dataKey="email" name="Email" stackId="v" fill={emailColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </m.BarChart>
          </m.ResponsiveContainer>
        );
      }
      return Comp;
    }),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface/60" aria-hidden /> },
);
