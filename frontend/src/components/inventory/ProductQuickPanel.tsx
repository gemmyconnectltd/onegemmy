"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { useBranchPricingStatus, useProductBranches, useProductStockByBranch, useUpdateProduct, useUpdateProductBranches } from "@/lib/api/hooks";
import type { ApiBranchSetting } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Toggle } from "@/components/ui/Toggle";
import { ProductAvatar } from "@/components/inventory/ProductAvatar";
import { StockPill } from "@/components/inventory/BranchStock";

type Draft = { name: string; price: string; cost: string; min_stock: string };
const draftOf = (p: ApiProduct): Draft => ({ name: p.name, price: String(p.price), cost: String(p.cost), min_stock: String(p.min_stock ?? 0) });

/** The product picked in the Products list, beside it (like a sale in Sales History): what it is, where its stock is, and the
 *  everyday fields to change on the spot. Everything else is one click away: "Edit all fields" opens the full form, "Open
 *  details" the product page, and the menu holds every existing action. Key it by product id so a new pick starts clean. */
export function ProductQuickPanel({ product: p, fmt, canEdit, onClose, onEditAll, actions, stockLabel }: {
  product: ApiProduct; fmt: (n: number) => string; canEdit: boolean; onClose: () => void; onEditAll: () => void; actions: ReactNode; stockLabel: string;
}) {
  const update = useUpdateProduct();
  const [draft, setDraft] = useState<Draft>(() => draftOf(p));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const changes: Record<string, string | number> = {};
  if (draft.name.trim() && draft.name.trim() !== p.name) changes.name = draft.name.trim();
  if (!p.has_variants && num(draft.price) !== p.price) changes.price = num(draft.price);
  if (num(draft.cost) !== p.cost) changes.cost = num(draft.cost);
  if (num(draft.min_stock) !== (p.min_stock ?? 0)) changes.min_stock = num(draft.min_stock);
  const price = p.has_variants ? p.price : num(draft.price), cost = num(draft.cost);
  const problem = !draft.name.trim() ? "Give the product a name."
    : Object.values(changes).some((v) => typeof v === "number" && (!Number.isFinite(v) || v < 0)) ? "Prices and levels must be 0 or more."
    : Number.isFinite(price) && Number.isFinite(cost) && price > 0 && cost > price ? `The price (${fmt(price)}) is below the cost (${fmt(cost)}).` : "";
  const dirty = Object.keys(changes).length > 0;
  const margin = Number.isFinite(price) && price > 0 && Number.isFinite(cost) ? Math.round(((price - cost) / price) * 100) : null;
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => { setSaved(false); setDraft((d) => ({ ...d, [k]: e.target.value })); };

  const save = async () => {
    if (!dirty || problem) return;
    setError("");
    try { await update.mutateAsync({ id: p.id, data: changes }); setSaved(true); }
    catch (e) { setError((e as { detail?: string })?.detail ?? "The changes could not be saved."); }
  };

  const total = p.has_variants && p.variants?.length ? p.variants.reduce((n, v) => n + v.stock, 0) : p.stock;

  return (
    <section aria-label={`Product ${p.name}`} className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <ProductAvatar name={p.name} imageUrl={p.image_url} size={44} className="shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-muted">{p.sku || "No SKU"}</p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-foreground" title={p.name}>{p.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`pesaa-badge ${p.is_active ? "pesaa-badge-success" : "pesaa-badge-neutral"}`}>{p.is_active ? "Active" : "Inactive"}</span>
            {p.has_variants && <span className="pesaa-badge pesaa-badge-neutral">{p.variants?.length ?? 0} variants</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close product details" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={16} /></button>
      </header>

      <div className="space-y-5 px-4 py-4 text-sm">
        <Branches product={p} fmt={fmt} total={total} stockLabel={stockLabel} />

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div><dt className="text-xs text-muted">Category</dt><dd className="truncate">{p.category?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Brand</dt><dd className="truncate">{p.brand?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Unit</dt><dd className="truncate">{p.unit?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Barcode</dt><dd className="truncate font-mono text-xs">{p.barcode || "—"}</dd></div>
        </dl>

        {canEdit ? <form className="space-y-3 border-t border-border pt-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3 className="pesaa-card-title">Quick edit</h3>
          <Field label="Name"><Input value={draft.name} onChange={set("name")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            {p.has_variants ? <div className="col-span-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted">Each variant has its own price. Change them under Variants.</div>
              : <Field label="Selling price"><Input type="number" min={0} step="any" inputMode="decimal" className="text-right tabular-nums" value={draft.price} onChange={set("price")} /></Field>}
            <Field label="Cost"><Input type="number" min={0} step="any" inputMode="decimal" className="text-right tabular-nums" value={draft.cost} onChange={set("cost")} /></Field>
            <Field label="Reorder level" hint="Low below this"><Input type="number" min={0} step="any" inputMode="decimal" className="text-right tabular-nums" value={draft.min_stock} onChange={set("min_stock")} /></Field>
          </div>
          {margin !== null && <p className="text-xs text-muted">Margin <span className={`font-semibold ${margin < 0 ? "text-red-600" : "text-foreground"}`}>{margin}%</span></p>}
          {(problem && dirty) || error ? <p role="alert" className="text-xs text-red-600">{error || problem}</p> : saved && !dirty ? <p role="status" className="text-xs text-accent">Saved.</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!dirty || !!problem} loading={update.isPending}>Save</Button>
            {dirty && <Button type="button" variant="secondary" onClick={() => { setDraft(draftOf(p)); setError(""); }}>Undo</Button>}
          </div>
        </form> : <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-4">
          <div><dt className="text-xs text-muted">Selling price</dt><dd className="font-semibold tabular-nums">{fmt(p.price)}</dd></div>
          <div><dt className="text-xs text-muted">Cost</dt><dd className="tabular-nums">{fmt(p.cost)}</dd></div>
        </dl>}
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {canEdit && <Button variant="secondary" onClick={onEditAll}>Edit all fields</Button>}
        <Link href={`/inventory/products/${p.id}`}><Button variant="secondary">Open details <ArrowUpRight size={14} /></Button></Link>
        <span className="ml-auto">{actions}</span>
      </footer>
    </section>
  );
}

type BranchDraft = Record<string, { is_available: boolean; price: string }>;
const fromRow = (r: ApiBranchSetting) => ({ is_available: r.is_available, price: r.price == null ? "" : String(r.price) });

/** Every branch on one list: its stock (and warehouse), and, when the business uses branch prices, the price it sells at and
 *  whether it sells the product at all, changed right on the row and saved together. Empty price = the default. When branch
 *  prices are off, the owner is told where to switch them on. */
function Branches({ product: p, fmt, total, stockLabel }: { product: ApiProduct; fmt: (n: number) => string; total: number; stockLabel: string }) {
  const stock = useProductStockByBranch(p.id);
  const status = useBranchPricingStatus();
  const pricingOn = !!status.data?.enabled && !!status.data.can_manage;
  const prices = useProductBranches(p.id, { enabled: pricingOn });
  const save = useUpdateProductBranches();
  const [draft, setDraft] = useState<BranchDraft>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const stockRows = stock.data?.uses_warehouses ? stock.data.items : [];
  const priceRows = pricingOn ? prices.data?.branches ?? [] : [];
  // One row per branch: stock rows first (with the shared warehouses), then branches that only have a price setting.
  const rows = [
    ...stockRows.map((r) => ({ key: r.branch_id ?? "shared", name: r.name, sub: r.warehouses.map((w) => w.name).join(", ") || "No warehouse", stock: r, price: priceRows.find((x) => x.branch_id === r.branch_id) })),
    ...priceRows.filter((x) => !stockRows.some((r) => r.branch_id === x.branch_id)).map((x) => ({ key: x.branch_id, name: x.branch_name, sub: x.is_main ? "Main branch" : "", stock: undefined, price: x })),
  ];

  const changes = priceRows.flatMap((r) => {
    const d = draft[r.branch_id];
    if (!d) return [];
    const price = d.price.trim() === "" ? null : Number(d.price);
    return d.is_available !== r.is_available || price !== r.price ? [{ branch_id: r.branch_id, is_available: d.is_available, price }] : [];
  });
  const cost = prices.data?.cost ?? p.cost;
  const problem = changes.map((c) => {
    if (c.price == null) return "";
    const name = priceRows.find((b) => b.branch_id === c.branch_id)?.branch_name ?? "this branch";
    if (!Number.isFinite(c.price) || c.price <= 0) return `The price in ${name} must be more than ${fmt(0)}.`;
    return c.price < cost ? `The price in ${name} (${fmt(c.price)}) is below cost (${fmt(cost)}).` : "";
  }).find(Boolean) ?? "";
  const set = (r: ApiBranchSetting, patch: Partial<BranchDraft[string]>) => { setSaved(false); setDraft((d) => ({ ...d, [r.branch_id]: { ...(d[r.branch_id] ?? fromRow(r)), ...patch } })); };
  const submit = async () => {
    setError("");
    try { await save.mutateAsync({ id: p.id, branches: changes }); setDraft({}); setSaved(true); }
    catch (e) { setError((e as { detail?: string })?.detail ?? "The branch changes could not be saved."); }
  };
  const defaultPrice = prices.data?.default_price ?? p.price;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2"><h3 className="text-xs font-semibold text-muted">{stockLabel}</h3><span className="text-lg font-semibold tabular-nums">{total.toLocaleString()}</span></div>
      {rows.length > 0 && <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => {
          const ps = r.price;
          const d = ps ? draft[ps.branch_id] ?? fromRow(ps) : null;
          return <li key={r.key} className={`space-y-2 px-3 py-2.5 ${d && !d.is_available ? "bg-surface/60" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span>{r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}</span>
              {r.stock && <span className="inline-flex shrink-0 items-center gap-2"><StockPill status={r.stock.status} /><span className="font-semibold tabular-nums">{r.stock.on_hand.toLocaleString()}</span></span>}
            </div>
            {ps && d && <div className="flex items-center gap-2">
              {p.has_variants ? <span className="flex-1 text-xs text-muted">Variant prices</span>
                : <Input type="number" min={0} step="any" inputMode="decimal" aria-label={`Price in ${ps.branch_name}`} placeholder={`${defaultPrice} (default)`}
                    className="min-w-0 flex-1 text-right tabular-nums" value={d.price} disabled={!ps.editable || !d.is_available} onChange={(e) => set(ps, { price: e.target.value })} />}
              <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <Toggle checked={d.is_available} onChange={(on) => set(ps, { is_available: on })} disabled={!ps.editable} size="sm" label={`Sell in ${ps.branch_name}`} />
                {d.is_available ? "Sold here" : "Hidden"}
              </label>
            </div>}
          </li>;
        })}
      </ul>}
      {pricingOn ? <>
        {(problem && changes.length) || error ? <p role="alert" className="mt-2 text-xs text-red-600">{error || problem}</p>
          : saved && !changes.length ? <p role="status" className="mt-2 text-xs text-accent">Saved. The tills use it from the next sale.</p>
          : <p className="mt-2 text-xs text-muted">Leave a price empty to sell at the default ({fmt(defaultPrice)}). &quot;Hidden&quot; removes it from that branch&apos;s till.</p>}
        {changes.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => void submit()} disabled={!!problem} loading={save.isPending}>Save {changes.length} branch change{changes.length === 1 ? "" : "s"}</Button>
          <Button variant="secondary" onClick={() => { setDraft({}); setError(""); }}>Undo</Button>
        </div>}
      </> : status.data && !status.data.enabled && status.data.can_toggle ? <p className="mt-2 text-xs text-muted">
        To give a branch its own price or stop selling this there, <Link href="/settings/sales-pricing" className="font-medium text-accent hover:underline">switch on branch prices</Link>.
      </p> : null}
    </div>
  );
}
