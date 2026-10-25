"use client";

import dynamic from "next/dynamic";

const Skeleton = () => <div className="h-full w-full animate-pulse rounded-lg bg-surface/60" aria-hidden />;

export const TrendChart = dynamic(() => import("./TrafficCharts").then((m) => m.TrendChart), { ssr: false, loading: Skeleton });
export const StackedAreaChart = dynamic(() => import("./TrafficCharts").then((m) => m.StackedAreaChart), { ssr: false, loading: Skeleton });
export const LineSeriesChart = dynamic(() => import("./TrafficCharts").then((m) => m.LineSeriesChart), { ssr: false, loading: Skeleton });
export const HourlyBars = dynamic(() => import("./TrafficCharts").then((m) => m.HourlyBars), { ssr: false, loading: Skeleton });
export type { ChartTheme, StackSeries, TrendPoint } from "./TrafficCharts";
