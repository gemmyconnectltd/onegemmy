"use client";

import { useMemo, useState } from "react";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { Toggle } from "@/components/ui/Toggle";
import { useProductBranches, useUpdateProductBranches } from "@/lib/api/hooks";
import type { ApiBranchSetting } from "@/lib/api";

type Draft = Record<string, { is_available: boolean; price: string }>;

const fromRow = (r: ApiBranchSetting) => ({ is_available: r.is_available, price: r.price == null ? "" : String(r.price) });

/** Branch prices tab of a product: where it is sold and at what price, per branch. Only rendered for businesses with
 *  branch prices switched on; the API refuses everyone else. */
/** `vatRate` (%) is the VAT inside the selling price (0 when none applies): margins are worked out on the price without VAT. */
export function ProductBranchPrices({ productId, fmt, vatRate = 0 }: { productId: string; fmt: (n: number) => string; vatRate?: number }) {
  const query = useProductBranches(productId);
  const save = useUpdateProductBranches();
  const data = query.data;
  const [draft, setDraft] = useState<Draft>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changes = useMemo(() => {
    if (!data) return [];
    return data.branches.flatMap((r) => {
      const d = draft[r.branch_id];  // only edited branches are in the draft
      if (!d) return [];
      const price = d.price.trim() === "" ? null : Number(d.price);
      const before = r.price;
      return d.is_available !== r.is_available || price !== before ? [{ branch_id: r.branch_id, is_available: d.is_available, price }] : [];
    });
  }, [data, draft]);
  // The same rules as the server, caught here so the message says what to fix.
  const problems = changes.flatMap((c) => {
    if (c.price == null || !data) return [];
    const branch = data.branches.find((b) => b.branch_id === c.branch_id)?.branch_name ?? "this branch";
    if (!Number.isFinite(c.price) || c.price <= 0) return [`Price for ${branch} must be more than ${fmt(0)}.`];
    if (c.price < data.cost) return [`Price for ${branch} (${fmt(c.price)}) is below cost (${fmt(data.cost)}).`];
    return [];
  });
  const invalid = problems.length > 0;
  const canEdit = !!data?.branches.some((b) => b.editable);

  if (query.isLoading || query.error || !data) return <TableState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} />;
  const set = (row: ApiBranchSetting, patch: Partial<Draft[string]>) => { setSaved(false); setDraft((d) => ({ ...d, [row.branch_id]: { ...(d[row.branch_id] ?? fromRow(row)), ...patch } })); };
  const submit = async () => {
    setProblem(null);
    try {
      await save.mutateAsync({ id: productId, branches: changes });
      setDraft({});
      setSaved(true);
    } catch (e) {
      setProblem((e as { detail?: string })?.detail ?? "The branch prices could not be saved.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4">
        <div><p className="text-xs text-muted">Default price</p><p className="mt-1 text-lg font-semibold tabular-nums">{fmt(data.default_price)}</p></div>
        <div><p className="text-xs text-muted">Cost</p><p className="mt-1 text-sm font-medium tabular-nums">{fmt(data.cost)}</p></div>
        <p className="min-w-[220px] flex-1 text-sm text-muted">A branch with no price of its own sells at the default. Change the default with “Edit product” and those branches follow it. Margins are worked out without VAT.</p>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <TableScroll label="Branches and prices">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 font-medium">Selling price</th><th className="px-4 py-2.5 text-right font-medium">Margin (excl. VAT)</th><th className="px-4 py-2.5 font-medium">Hidden</th></tr></thead>
            <tbody className="divide-y divide-border">{data.branches.map((r) => {
              const d = draft[r.branch_id] ?? fromRow(r);
              const own = d.price.trim() !== "";
              const effective = own ? Number(d.price) : data.default_price;
              const net = effective / (1 + vatRate / 100);  // the price without VAT
              const margin = net > 0 && Number.isFinite(net) ? ((net - data.cost) / net) * 100 : null;
              const editable = r.editable;
              return (
                <tr key={r.branch_id} className={d.is_available ? "" : "bg-surface"}>
                  <td className="px-4 py-3 font-medium">{r.branch_name}{r.is_main && <span className="ml-2 text-xs font-normal text-muted">Main</span>}</td>
                  <td className="px-4 py-3">
                    {data.has_variants ? <span className="text-xs text-muted">Each variant keeps its own price</span> : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input type="number" min={0} step="any" inputMode="decimal" className="w-36 text-right tabular-nums" aria-label={`Price in ${r.branch_name}`}
                          placeholder={String(data.default_price)} value={d.price} disabled={!editable || !d.is_available}
                          onChange={(e) => set(r, { price: e.target.value })} />
                        {own ? <>
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Own price</span>
                          {editable && <Button size="sm" variant="ghost" onClick={() => set(r, { price: "" })}>Use default</Button>}
                        </> : <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">Default</span>}
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${margin != null && margin < 0 ? "text-destructive" : "text-muted"}`}>{margin == null ? "—" : `${margin.toFixed(1)}%`}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Toggle checked={!d.is_available} onChange={(hidden) => set(r, { is_available: !hidden })} disabled={!editable} size="sm" label={`Hide ${data.name} in ${r.branch_name}`} />
                      {!d.is_available && <span className="inline-flex items-center gap-1 text-xs text-muted"><EyeOff size={12} aria-hidden /> Not sold here</span>}
                      {!editable && <span className="text-xs text-muted">View only</span>}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </TableScroll>
        {canEdit && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            {problem && <p role="alert" className="mr-auto text-sm text-destructive">{problem}</p>}
            {!problem && saved && changes.length === 0 && <p role="status" className="mr-auto text-sm text-muted">Saved.</p>}
            {!problem && invalid && <p role="alert" className="mr-auto text-sm text-destructive">{problems[0]}</p>}
            {!problem && !invalid && changes.length > 0 && <p className="mr-auto text-sm text-muted">{changes.length} unsaved {changes.length === 1 ? "change" : "changes"}</p>}
            <Button variant="secondary" disabled={!changes.length || save.isPending} onClick={() => { setDraft({}); setProblem(null); }}>Discard</Button>
            <Button disabled={!changes.length || invalid} loading={save.isPending} onClick={() => void submit()}>Save prices</Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted">A hidden product stays in stock and history; it just can’t be sold in that branch. Every change is recorded in this product’s History.</p>
    </div>
  );
}
