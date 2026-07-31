"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Calendar,
} from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/config";

const periods = ["Today", "This Week", "This Month", "This Year"] as const;
type Period = (typeof periods)[number];

const mockReportData: Record<
  Period,
  { sales: number; expenses: number; profit: number; margin: number }
> = {
  Today: { sales: 156000, expenses: 45000, profit: 111000, margin: 71.2 },
  "This Week": { sales: 345000, expenses: 90000, profit: 255000, margin: 73.9 },
  "This Month": {
    sales: 1250000,
    expenses: 380000,
    profit: 870000,
    margin: 69.6,
  },
  "This Year": {
    sales: 15000000,
    expenses: 4500000,
    profit: 10500000,
    margin: 70.0,
  },
};

const weeklySales = [
  { day: "Mon", sales: 45000 },
  { day: "Tue", sales: 38000 },
  { day: "Wed", sales: 52000 },
  { day: "Thu", sales: 41000 },
  { day: "Fri", sales: 67000 },
  { day: "Sat", sales: 73000 },
  { day: "Sun", sales: 29000 },
];

const expenseByCategory = [
  { category: "Inventory Purchase", amount: 180000, pct: 47 },
  { category: "Rent", amount: 80000, pct: 21 },
  { category: "Utilities", amount: 45000, pct: 12 },
  { category: "Transport", amount: 30000, pct: 8 },
  { category: "Marketing", amount: 25000, pct: 7 },
  { category: "Other", amount: 20000, pct: 5 },
];

const topProducts = [
  { name: "Wireless Earbuds", sold: 18, revenue: 270000 },
  { name: "Bluetooth Speaker", sold: 12, revenue: 300000 },
  { name: "Phone Charger 20W", sold: 35, revenue: 280000 },
  { name: "USB-C Cable 1m", sold: 89, revenue: 267000 },
  { name: "Phone Case - iPhone", sold: 67, revenue: 335000 },
];

function formatCurrency(value: number) {
  return `${CURRENCY_SYMBOL} ${value.toLocaleString()}`;
}

export default function ReportsPage() {
  const [activePeriod, setActivePeriod] = useState<Period>("This Month");
  const data = mockReportData[activePeriod];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-accent" />
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1">
        {periods.map((period) => (
          <button
            key={period}
            onClick={() => setActivePeriod(period)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activePeriod === period
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {period}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Total Sales</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {formatCurrency(data.sales)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">
              Total Expenses
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {formatCurrency(data.expenses)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Net Profit</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {formatCurrency(data.profit)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">
              Profit Margin
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <BarChart3 className="h-4 w-4 text-accent" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {data.margin}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Sales by Day
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySales}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e8e4de"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#b3b6b7", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#b3b6b7", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Sales"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e8e4de",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                <Bar dataKey="sales" fill="#af9164" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Expenses by Category
          </h2>
          <div className="space-y-4">
            {expenseByCategory.map((item) => (
              <div key={item.category}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {item.category}
                  </span>
                  <span className="text-sm text-muted">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Top Selling Products
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 font-medium text-muted">Product</th>
                <th className="pb-3 text-right font-medium text-muted">
                  Units Sold
                </th>
                <th className="pb-3 text-right font-medium text-muted">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product, i) => (
                <tr
                  key={product.name}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="font-medium text-foreground">
                        {product.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-foreground">
                    {product.sold}
                  </td>
                  <td className="py-3 text-right font-medium text-foreground">
                    {formatCurrency(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
