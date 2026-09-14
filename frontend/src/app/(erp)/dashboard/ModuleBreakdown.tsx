"use client";

import { useState } from "react";
import { BarChart3, Landmark, Package, Users2, Handshake, Truck } from "lucide-react";

import { DonutChart } from "@/components/charts/lazy";
import type { ChartPalette } from "@/lib/chartColors";
import { fmtMoney } from "@/lib/config";
import {
  useExpenses, useDeals, useEmployees, useDepartments, usePurchaseOrders,
  type ApiProduct,
} from "@/lib/api/hooks";

type Datum = { name: string; value: number };
type ValueKind = "money" | "count";

function productStock(p: ApiProduct) {
  return p.has_variants && p.variants?.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock;
}

function groupSum<T>(items: T[], keyFn: (item: T) => string, valueFn: (item: T) => number): Datum[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + valueFn(item));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const TABS = [
  { key: "sales", label: "Sales", icon: BarChart3, unit: "money" as ValueKind, periodBound: true },
  { key: "finance", label: "Finance", icon: Landmark, unit: "money" as ValueKind, periodBound: true },
  { key: "inventory", label: "Inventory", icon: Package, unit: "money" as ValueKind, periodBound: false },
  { key: "crm", label: "CRM", icon: Handshake, unit: "money" as ValueKind, periodBound: false },
  { key: "hr", label: "HR", icon: Users2, unit: "count" as ValueKind, periodBound: false },
  { key: "procurement", label: "Procurement", icon: Truck, unit: "money" as ValueKind, periodBound: false },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ModuleBreakdown({
  salesData, inventory, from, to, label, c,
}: {
  salesData: Datum[];
  inventory: ApiProduct[];
  from: string;
  to: string;
  label: string;
  c: ChartPalette;
}) {
  const [tab, setTab] = useState<TabKey>("sales");

  const expensesQ = useExpenses(undefined, { enabled: tab === "finance" });
  const dealsQ = useDeals(1, 200, undefined, { enabled: tab === "crm" });
  const employeesQ = useEmployees(undefined, { enabled: tab === "hr" });
  const departmentsQ = useDepartments({ enabled: tab === "hr" });
  const poQ = usePurchaseOrders(undefined, 1, 200, { enabled: tab === "procurement" });

  const colors = [c.income, c.blue, c.gold, c.expenses, c.profit, c.gray];

  let data: Datum[] = [];
  let empty = "No data yet";
  let loading = false;

  if (tab === "sales") {
    data = salesData;
    empty = "No sales data yet";
  } else if (tab === "finance") {
    loading = expensesQ.isLoading;
    const expenses = (expensesQ.data?.items ?? []).filter((e) => {
      const d = (e.expense_date ?? "").slice(0, 10);
      return d >= from && d <= to;
    });
    data = groupSum(expenses, (e) => e.category || "Uncategorized", (e) => e.amount);
    empty = "No expenses recorded this period";
  } else if (tab === "inventory") {
    loading = false;
    data = groupSum(inventory, (p) => p.category?.name ?? "Uncategorized", (p) => p.cost * productStock(p));
    empty = "No inventory value yet";
  } else if (tab === "crm") {
    loading = dealsQ.isLoading;
    const deals = dealsQ.data?.items ?? [];
    data = groupSum(deals, (d) => d.stage, (d) => d.value);
    empty = "No deals in the pipeline yet";
  } else if (tab === "hr") {
    loading = employeesQ.isLoading || departmentsQ.isLoading;
    const employees = employeesQ.data?.items ?? [];
    data = groupSum(employees, (e) => e.department?.name ?? "Unassigned", () => 1);
    empty = "No employees added yet";
  } else if (tab === "procurement") {
    loading = poQ.isLoading;
    const orders = poQ.data?.items ?? [];
    data = groupSum(orders, (o) => o.supplier?.name ?? "Unknown supplier", (o) => o.total);
    empty = "No purchase orders yet";
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const activeTab = TABS.find((t) => t.key === tab)!;
  const fmtValue = (v: number) => (activeTab.unit === "money" ? fmtMoney(v) : `${v} ${v === 1 ? "employee" : "employees"}`);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">Business Breakdown</h2>
        <div className="flex items-center bg-surface border border-border rounded-lg p-0.5 gap-0.5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold rounded-md transition-all whitespace-nowrap ${
                tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <p className="text-[11px] text-muted mb-3">
          {activeTab.periodBound ? `${label} · by ${tab === "sales" ? "category" : "category"}` : "Current snapshot"}
        </p>
        {loading ? (
          <p className="px-2 py-10 text-[12px] text-muted text-center">Loading…</p>
        ) : total <= 0 ? (
          <p className="px-2 py-10 text-[12px] text-muted text-center">{empty}</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-[140px] h-[140px] flex-shrink-0">
              <DonutChart
                data={data}
                colors={colors}
                innerRadius={40}
                outerRadius={66}
                tooltipStyle={c.tooltip}
                tooltipFormatter={(v, n) => [fmtValue(Number(v)), String(n)]}
              />
            </div>
            <div className="flex-1 min-w-0 w-full space-y-2">
              {data.slice(0, 6).map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                  <span className="text-[12px] text-foreground/80 truncate flex-1">{d.name}</span>
                  <span className="text-[11px] font-mono text-foreground/70 flex-shrink-0">{fmtValue(d.value)}</span>
                  <span className="text-[11px] font-bold text-muted flex-shrink-0 w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
