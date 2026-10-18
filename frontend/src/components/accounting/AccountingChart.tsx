"use client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { useFinancialMoney } from "./FinancialShared";
// Loaded as one chunk: Recharts axes and series must mount together.
export default function AccountingChart({ data, cash = false, currency }: { data: { month: string; income: number; expenses: number; cash: number }[]; cash?: boolean; currency: string }) {
  const { theme } = useAppConfig(); const palette = chartPalette(theme === "dark"); const fmt = useFinancialMoney(currency);
  const children = <><CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis width={65} tick={{ fontSize: 10 }} /><Tooltip formatter={v => fmt(Number(v))} contentStyle={palette.tooltip} /></>;
  return <ResponsiveContainer width="100%" height="100%">{cash ? <LineChart data={data}>{children}<Line isAnimationActive={false} name="Net cash movement" dataKey="cash" stroke={palette.income} strokeWidth={2} dot={{ r: 3 }} /></LineChart> : <BarChart data={data}>{children}<Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /><Bar isAnimationActive={false} name="Income" dataKey="income" fill={palette.income} radius={[3, 3, 0, 0]} /><Bar isAnimationActive={false} name="Expenses" dataKey="expenses" fill={palette.expenses} radius={[3, 3, 0, 0]} /></BarChart>}</ResponsiveContainer>;
}
