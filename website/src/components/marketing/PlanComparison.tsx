import { Check, Minus } from "lucide-react";
import { featureGroups, plans, type Cell } from "@/lib/plans";

function CellValue({ value }: { value: Cell }) {
  if (typeof value === "string") return <span className="text-sm font-semibold text-foreground">{value}</span>;
  return value ? (
    <Check size={18} className="mx-auto text-accent" aria-label="Included" />
  ) : (
    <Minus size={16} className="mx-auto text-slate-300" aria-label="Not included" />
  );
}

export function PlanComparison() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <caption className="sr-only">Feature comparison across Pesaa plans</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[28%] bg-white p-4 text-xs font-semibold text-muted">Features</th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={`p-4 text-center text-sm font-bold text-foreground ${plan.featured ? "bg-[var(--primary-light)]" : "bg-white"}`}
              >
                {plan.title}
                {plan.featured && <span className="mt-1 block text-[11px] font-semibold text-accent">Most popular</span>}
              </th>
            ))}
          </tr>
        </thead>
        {featureGroups.map((group) => (
          <tbody key={group.title}>
            <tr>
              <th scope="colgroup" colSpan={plans.length + 1} className="bg-surface px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground">
                {group.title}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground/80">{row.label}</th>
                {row.values.map((value, i) => (
                  <td key={plans[i].id} className={`px-4 py-3 text-center ${plans[i].featured ? "bg-[var(--primary-light)]/60" : ""}`}>
                    <CellValue value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
