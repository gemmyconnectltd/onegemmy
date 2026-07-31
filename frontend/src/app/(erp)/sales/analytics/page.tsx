"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { useAppConfig } from "@/lib/appConfig";

const monthly = [
  { month: "Jan", sales: 980000 }, { month: "Feb", sales: 1200000 },
  { month: "Mar", sales: 870000 }, { month: "Apr", sales: 1450000 },
  { month: "May", sales: 1100000 },{ month: "Jun", sales: 1680000 },
  { month: "Jul", sales: 1250000 },
];
const topReps = [
  { name: "John D.",  sales: 450000 }, { name: "Sarah M.", sales: 380000 },
  { name: "Mike R.",  sales: 290000 }, { name: "Anna K.",  sales: 210000 },
];

export default function SalesAnalyticsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Sales Analytics</h1>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Monthly Sales Trend</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [fmt(Number(v)), "Sales"]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
                <Line type="monotone" dataKey="sales" stroke="#6f1a07" strokeWidth={2.5} dot={{ fill: "#6f1a07", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-card border border-border p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Top Sales Reps</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topReps} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#2b2118" }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v) => [fmt(Number(v)), "Sales"]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
                <Bar dataKey="sales" fill="#af9164" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
