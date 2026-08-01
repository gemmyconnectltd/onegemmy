import type { CSSProperties } from "react";

export type ChartPalette = {
  grid: string;
  tick: string;
  tooltip: CSSProperties;
  income: string;
  expenses: string;
  profit: string;
  primary: string;
  gold: string;
  blue: string;
  gray: string;
};

export function chartPalette(dark: boolean): ChartPalette {
  if (dark) {
    return {
      grid: "#33333b",
      tick: "#a0a2ab",
      tooltip: {
        backgroundColor: "#1c1c21",
        border: "1px solid #3a3a42",
        color: "#f1f1f4",
        borderRadius: 8,
        fontSize: 12,
      },
      income: "#34d399",
      expenses: "#f87171",
      profit: "#e0785a",
      primary: "#d8b98a",
      gold: "#d8b98a",
      blue: "#7aa2ff",
      gray: "#a0a2ab",
    };
  }
  return {
    grid: "#e8e4de",
    tick: "#b3b6b7",
    tooltip: {
      backgroundColor: "#ffffff",
      border: "1px solid #e8e4de",
      color: "#2b2118",
      borderRadius: 8,
      fontSize: 12,
    },
    income: "#10B981",
    expenses: "#ef4444",
    profit: "#6f1a07",
    primary: "#af9164",
    gold: "#af9164",
    blue: "#3b82f6",
    gray: "#6b7280",
  };
}
