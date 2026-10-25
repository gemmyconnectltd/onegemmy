import { Check, Minus } from "lucide-react";
import { regionLabel, type PlanPrice, type PublicPricing } from "@/lib/pricing";

type Cell = boolean | string;

const limit = (v: number | null, none = "—") => (v === null ? none : v.toLocaleString("en"));
const storage = (mb: number | null) => (mb === null ? "—" : mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

function CellValue({ value }: { value: Cell }) {
  if (typeof value === "string") return <span className="text-sm font-semibold text-foreground">{value}</span>;
  return value ? <Check size={18} className="mx-auto text-accent" aria-label="Included" /> : <Minus size={16} className="mx-auto text-slate-300" aria-label="Not included" />;
}

/** Feature table built from each plan's real entitlements (limits and modules) in the chosen currency. */
export function PlanComparison({ pricing, currency }: { pricing: PublicPricing; currency: string }) {
  const plans = pricing.plans.filter((p) => p.prices[currency]);
  if (plans.length === 0) return null;
  const at = (i: number): PlanPrice => plans[i].prices[currency];
  const rows: { label: string; values: Cell[] }[] = [
    { label: "Users included", values: plans.map((_, i) => at(i).includedUsers.toLocaleString("en")) },
    { label: "Maximum users", values: plans.map((_, i) => limit(at(i).maxUsers, "No limit")) },
    { label: "Branches included", values: plans.map((_, i) => at(i).includedBranches.toLocaleString("en")) },
    { label: "Maximum branches", values: plans.map((_, i) => limit(at(i).maxBranches, "No limit")) },
    ...(plans.some((_, i) => at(i).maxProducts) ? [{ label: "Products", values: plans.map((_, i) => limit(at(i).maxProducts, "No limit")) }] : []),
    ...(plans.some((_, i) => at(i).maxStorageMb) ? [{ label: "Storage", values: plans.map((_, i) => (at(i).maxStorageMb ? storage(at(i).maxStorageMb) : "No limit")) }] : []),
    ...(plans.some((_, i) => at(i).trialDays) ? [{ label: "Free trial", values: plans.map((_, i) => (at(i).trialDays ? `${at(i).trialDays} days` : false)) }] : []),
  ];
  const modules = [...new Map(plans.flatMap((p) => p.modules).map((m) => [m.key, m.name])).entries()].map(([key, name]) => ({ key, name }));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">Feature comparison across plans, prices in {regionLabel(currency)}</caption>
        <thead>
          <tr className="border-b border-border"><th scope="col" className="w-[30%] bg-white p-4 text-xs font-semibold text-muted">Features</th>
            {plans.map((p) => <th key={p.id} scope="col" className="bg-white p-4 text-center text-sm font-bold text-foreground">{p.name}</th>)}</tr>
        </thead>
        <tbody>
          <tr><th scope="colgroup" colSpan={plans.length + 1} className="bg-surface px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground">Allowances</th></tr>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border"><th scope="row" className="px-4 py-3 text-sm font-medium text-foreground/80">{r.label}</th>
              {r.values.map((v, i) => <td key={plans[i].id} className="px-4 py-3 text-center"><CellValue value={v} /></td>)}</tr>
          ))}
          {modules.length > 0 && <tr><th scope="colgroup" colSpan={plans.length + 1} className="bg-surface px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground">Modules</th></tr>}
          {modules.map((m) => (
            <tr key={m.key} className="border-t border-border"><th scope="row" className="px-4 py-3 text-sm font-medium text-foreground/80">{m.name}</th>
              {plans.map((p) => <td key={p.id} className="px-4 py-3 text-center"><CellValue value={p.modules.some((x) => x.key === m.key)} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
