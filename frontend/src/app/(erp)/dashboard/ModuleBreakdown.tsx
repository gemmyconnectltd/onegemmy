"use client";

import { BarChart3, Landmark, Package, Handshake } from "lucide-react";

import { BreakdownCard, breakdownColors, groupSum, type BreakdownDatum } from "@/components/charts/BreakdownCard";
import type { ChartPalette } from "@/lib/chartColors";
import { useExpenses, useDeals, type ApiProduct } from "@/lib/api/hooks";

function productStock(p: ApiProduct) {
  return p.has_variants && p.variants?.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock;
}

export function ModuleBreakdown({
  salesData, inventory, from, to, label, c,
}: {
  salesData: BreakdownDatum[];
  inventory: ApiProduct[];
  from: string;
  to: string;
  label: string;
  c: ChartPalette;
}) {
  const expensesQ = useExpenses();
  const dealsQ = useDeals(1, 200);

  const colors = breakdownColors(c);

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
