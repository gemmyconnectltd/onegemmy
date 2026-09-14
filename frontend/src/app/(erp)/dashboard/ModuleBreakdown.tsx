"use client";

import { BarChart3, Landmark, Package, Handshake } from "lucide-react";

import { DonutChart } from "@/components/charts/lazy";
import type { ChartPalette } from "@/lib/chartColors";
import { fmtMoney } from "@/lib/config";
import { useExpenses, useDeals, type ApiProduct } from "@/lib/api/hooks";

type Datum = { name: string; value: number };

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

function BreakdownCard({
  title, sub, icon: Icon, data, colors, tooltipStyle, empty, loading,
}: {
  title: string;
  sub: string;
  icon: typeof BarChart3;
  data: Datum[];
  colors: string[];
  tooltipStyle: ChartPalette["tooltip"];
  empty: string;
  loading?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Icon size={13} className="text-accent flex-shrink-0" />
          <h2 className="text-[13px] font-bold text-foreground truncate">{title}</h2>
        </div>
        <p className="text-[10.5px] text-muted mt-0.5">{sub}</p>
      </div>
      <div className="p-4 flex-1">
        {loading ? (
          <p className="px-2 py-8 text-[12px] text-muted text-center">Loading…</p>
        ) : total <= 0 ? (
          <p className="px-2 py-8 text-[12px] text-muted text-center">{empty}</p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-[84px] h-[84px] flex-shrink-0">
              <DonutChart
                data={data}
                colors={colors}
                innerRadius={26}
                outerRadius={42}
                tooltipStyle={tooltipStyle}
                tooltipFormatter={(v, n) => [fmtMoney(Number(v)), String(n)]}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              {data.slice(0, 4).map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                  <span className="text-[11px] text-foreground/80 truncate flex-1">{d.name}</span>
                  <span className="text-[10px] font-bold text-muted flex-shrink-0">{Math.round((d.value / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const expensesQ = useExpenses();
  const dealsQ = useDeals(1, 200);

  const colors = [c.income, c.blue, c.gold, c.expenses, c.profit, c.gray];

  const expenses = (expensesQ.data?.items ?? []).filter((e) => {
    const d = (e.expense_date ?? "").slice(0, 10);
    return d >= from && d <= to;
  });
  const financeData = groupSum(expenses, (e) => e.category || "Uncategorized", (e) => e.amount);

  const inventoryData = groupSum(inventory, (p) => p.category?.name ?? "Uncategorized", (p) => p.cost * productStock(p));

  const deals = dealsQ.data?.items ?? [];
  const crmData = groupSum(deals, (d) => d.stage, (d) => d.value);

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <BreakdownCard
        title="Sales by Category"
        sub={`${label} · revenue`}
        icon={BarChart3}
        data={salesData}
        colors={colors}
        tooltipStyle={c.tooltip}
        empty="No sales data yet"
      />
      <BreakdownCard
        title="Expenses by Category"
        sub={`${label} · costs`}
        icon={Landmark}
        data={financeData}
        colors={colors}
        tooltipStyle={c.tooltip}
        loading={expensesQ.isLoading}
        empty="No expenses recorded this period"
      />
      <BreakdownCard
        title="Stock Value"
        sub="Inventory · current"
        icon={Package}
        data={inventoryData}
        colors={colors}
        tooltipStyle={c.tooltip}
        empty="No inventory value yet"
      />
      <BreakdownCard
        title="Pipeline by Stage"
        sub="CRM · current"
        icon={Handshake}
        data={crmData}
        colors={colors}
        tooltipStyle={c.tooltip}
        loading={dealsQ.isLoading}
        empty="No deals in the pipeline yet"
      />
    </div>
  );
}
