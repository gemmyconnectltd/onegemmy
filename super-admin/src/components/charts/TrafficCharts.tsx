"use client";

// Chart.js charts for the Website Traffic page. Registered once, only the pieces used (tree-shaken), and this file is
// loaded through next/dynamic so Chart.js stays out of every other page's bundle.
import { useEffect, useRef } from "react";
import {
  BarController, BarElement, CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip,
  type ChartConfiguration, type ScriptableContext, type TooltipItem,
} from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip);

export interface ChartTheme { grid: string; tick: string; tooltipBg: string; tooltipText: string }

function useChart(config: () => ChartConfiguration, deps: unknown[]) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    chart.current?.destroy();
    chart.current = new Chart(canvas.current, config());
    return () => { chart.current?.destroy(); chart.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return canvas;
}

export interface TrendPoint { label: string; value: number; previousLabel: string | null; previous: number | null }

/** Smooth area line for one metric with the previous period dashed behind it; hovering shows both for that point. */
export function TrendChart({ points, color, name, theme }: { points: TrendPoint[]; color: string; name: string; theme: ChartTheme }) {
  const ref = useChart(() => ({
    type: "line",
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: "Previous period", data: points.map((p) => p.previous), borderColor: theme.tick, borderDash: [5, 5], borderWidth: 1.5,
          pointRadius: 0, pointHoverRadius: 0, tension: 0.35, fill: false, spanGaps: false,
        },
        {
          label: name, data: points.map((p) => p.value), borderColor: color, borderWidth: 2.5, tension: 0.35, pointRadius: 0,
          pointHoverRadius: 5, pointHoverBackgroundColor: color, pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2, fill: "origin",
          backgroundColor: (ctx: ScriptableContext<"line">) => {
            const { chart } = ctx;
            const { chartArea } = chart;
            if (!chartArea) return `${color}22`;
            const g = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, `${color}40`);
            g.addColorStop(1, `${color}00`);
            return g;
          },
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBg, titleColor: theme.tooltipText, bodyColor: theme.tooltipText, padding: 10, boxPadding: 4,
          borderColor: theme.grid, borderWidth: 1, displayColors: true,
          callbacks: {
            title: (items: TooltipItem<"line">[]) => {
              const i = items[0]?.dataIndex ?? 0;
              return items[0]?.datasetIndex === 0 ? points[i]?.previousLabel ?? "" : points[i]?.label ?? "";
            },
            label: (item: TooltipItem<"line">) => `${item.dataset.label}: ${Number(item.parsed.y ?? 0).toLocaleString()}${item.datasetIndex === 0 ? ` (${points[item.dataIndex]?.previousLabel ?? ""})` : ""}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: theme.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: theme.grid }, ticks: { color: theme.tick, precision: 0, maxTicksLimit: 5 } },
      },
    },
  }), [points, color, name, theme.grid, theme.tick, theme.tooltipBg, theme.tooltipText]);
  return <canvas ref={ref} role="img" aria-label={`${name} over time, compared with the previous period`} />;
}

/** The last 48 hours, one bar per hour — the "Realtime" strip. */
export function HourlyBars({ data, color, theme }: { data: { label: string; visitors: number }[]; color: string; theme: ChartTheme }) {
  const ref = useChart(() => ({
    type: "bar",
    data: { labels: data.map((d) => d.label), datasets: [{ label: "Visitors", data: data.map((d) => d.visitors), backgroundColor: `${color}cc`, hoverBackgroundColor: color, borderRadius: 2, barPercentage: 0.9, categoryPercentage: 1 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltipBg, titleColor: theme.tooltipText, bodyColor: theme.tooltipText, borderColor: theme.grid, borderWidth: 1, displayColors: false } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: theme.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 4 } },
        y: { display: false, beginAtZero: true },
      },
    },
  }), [data, color, theme.grid, theme.tick, theme.tooltipBg, theme.tooltipText]);
  return <canvas ref={ref} role="img" aria-label="Visitors per hour over the last 48 hours" />;
}

export interface StackSeries { label: string; color: string; data: number[] }

/** Stacked area of visitors per channel over time, so a shift in where traffic comes from is easy to see. */
export function StackedAreaChart({ labels, series, theme }: { labels: string[]; series: StackSeries[]; theme: ChartTheme }) {
  const ref = useChart(() => ({
    type: "line",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: `${s.color}55`, borderWidth: 1.5, tension: 0.3,
        pointRadius: 0, pointHoverRadius: 4, fill: true,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: theme.tick, usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
        tooltip: { backgroundColor: theme.tooltipBg, titleColor: theme.tooltipText, bodyColor: theme.tooltipText, borderColor: theme.grid, borderWidth: 1, padding: 10 },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: theme.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: theme.grid }, ticks: { color: theme.tick, precision: 0, maxTicksLimit: 5 } },
      },
    },
  } as ChartConfiguration), [labels, series, theme.grid, theme.tick, theme.tooltipBg, theme.tooltipText]);
  return <canvas ref={ref} role="img" aria-label="Visitors per channel over time" />;
}

/** Several independent lines over time (not stacked). Clicking a legend entry hides or shows that line. */
export function LineSeriesChart({ labels, series, theme }: { labels: string[]; series: StackSeries[]; theme: ChartTheme }) {
  const ref = useChart(() => ({
    type: "line",
    data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, borderWidth: 2.25, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, fill: false })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: theme.tick, usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
        tooltip: { backgroundColor: theme.tooltipBg, titleColor: theme.tooltipText, bodyColor: theme.tooltipText, borderColor: theme.grid, borderWidth: 1, padding: 10 },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: theme.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: theme.grid }, ticks: { color: theme.tick, precision: 0, maxTicksLimit: 5 } },
      },
    },
  } as ChartConfiguration), [labels, series, theme.grid, theme.tick, theme.tooltipBg, theme.tooltipText]);
  return <canvas ref={ref} role="img" aria-label="Trend over time" />;
}
