"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import Link from "next/link";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useBranchPrices, useBranchPricingStatus, useCategories, useUpdateBranchPrices } from "@/lib/api/hooks";
import type { ApiBranchPriceRow, BranchPriceShow, BranchSettingInput } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { Toggle } from "@/components/ui/Toggle";

type Cell = { is_available: boolean; price: string };
/** An edited cell remembers what it was, so edits survive paging, search and filters until saved or discarded. */
type Edit = Cell & { product_id: string; branch_id: string; was: { is_available: boolean; price: number | null } };
const key = (productId: string, branchId: string) => `${productId}:${branchId}`;
const SHOW: [BranchPriceShow, string][] = [["all", "All products"], ["differences", "Only differences"], ["hidden", "Hidden somewhere"]];

/** Every product × every branch on one screen: where it is sold and at what price. Only reachable for businesses with
 *  branch prices switched on (menu feature "branch_pricing"; the API refuses everyone else). */
export default function BranchPricesPage() {
  const router = useRouter();
  const { currencySymbol } = useAppConfig();
  const fmt = (n: number) => fmtMoney(n, currencySymbol);
  // Off, or no permission to manage branch prices: nothing to do here (the API refuses it too).
  const status = useBranchPricingStatus();
  const allowed = status.data?.enabled && status.data.can_manage;
  useEffect(() => { if (status.data && !allowed) router.replace("/inventory"); }, [status.data, allowed, router]);
  const [categoryId, setCategoryId] = useState("");
  const categories = useCategories().data?.items ?? [];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<BranchPriceShow>("all");
  const term = useDebouncedValue(search.trim());
  const q = useBranchPrices(page, pageSize, term || undefined, show, categoryId || undefined, { enabled: !!allowed });
  const save = useUpdateBranchPrices();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const data = q.data;
  const branches = data?.summary.branches ?? [];
  const canEdit = branches.some((b) => b.editable);
  const editable = (branchId: string) => branches.find((b) => b.id === branchId)?.editable ?? false;

  const cellOf = (row: ApiBranchPriceRow, branchId: string): Cell => {
    const edited = edits[key(row.id, branchId)];
    if (edited) return edited;
    const s = row.branches.find((b) => b.branch_id === branchId);
    return { is_available: s?.is_available ?? true, price: s?.price == null ? "" : String(s.price) };
  };
  const changes = useMemo(() => Object.values(edits).flatMap((e): (BranchSettingInput & { product_id: string })[] => {
    const price = e.price.trim() === "" ? null : Number(e.price);
    return e.is_available !== e.was.is_available || price !== e.was.price
      ? [{ product_id: e.product_id, branch_id: e.branch_id, is_available: e.is_available, price }] : [];
  }), [edits]);
  // Caught here so the message says what to fix; the server checks the same rules (above zero, not below cost).
  const problems = changes.flatMap((c) => {
    if (c.price == null) return [];
    const row = data?.items.find((r) => r.id === c.product_id);
    const branch = branches.find((b) => b.id === c.branch_id)?.name ?? "this branch";
    if (!Number.isFinite(c.price) || c.price <= 0) return [`Price for ${branch} must be more than ${fmt(0)}.`];
    if (row && c.price < row.cost) return [`Price for ${branch} (${fmt(c.price)}) is below cost (${fmt(row.cost)}).`];
    return [];
  });
  const invalid = problems.length > 0;
  const edit = (row: ApiBranchPriceRow, branchId: string, patch: Partial<Cell>) => {
    setSaved(null);
    const s = row.branches.find((b) => b.branch_id === branchId);
    setEdits((all) => ({ ...all, [key(row.id, branchId)]: {
      ...cellOf(row, branchId), ...patch, product_id: row.id, branch_id: branchId,
      was: all[key(row.id, branchId)]?.was ?? { is_available: s?.is_available ?? true, price: s?.price ?? null },
    } }));
  };
  const submit = async () => {
    setProblem(null);
    try {
      const r = await save.mutateAsync(changes);
      setEdits({});
      setSaved(r.data.changed);
    } catch (e) {
      setProblem((e as { detail?: string })?.detail ?? "The prices could not be saved.");
    }
  };

  if (status.isLoading || !allowed) return <TableState loading={status.isLoading} error={status.error} onRetry={() => void status.refetch()} />;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="pesaa-page-title">Branch prices</h1>
        <p className="text-sm text-muted">Where each product is sold and at what price. A branch with no price of its own sells at the product’s default price; a hidden product disappears from that branch’s till.</p>
      </header>

      {data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Same price everywhere", data.summary.products - data.summary.with_own_price, `of ${data.summary.products} products`, "all"],
          ["Own price in a branch", data.summary.with_own_price, "products", "differences"],
          ["Hidden in a branch", data.summary.hidden_somewhere, "products", "hidden"]].map(([label, value, note, target]) => (
          <button key={label as string} type="button" onClick={() => { setShow(target as BranchPriceShow); setPage(1); }} className="rounded-xl border border-border bg-card p-4 text-left hover:border-accent">
            <span className="block text-xs text-muted">{label}</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums">{value}</span>
            <span className="block text-xs text-muted">{note}</span>
          </button>))}
      </div>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-border bg-card p-1">
          {SHOW.map(([value, label]) => <button key={value} type="button" aria-pressed={show === value} onClick={() => { setShow(value); setPage(1); }}
            className={`min-h-8 rounded-md px-3 text-sm font-medium ${show === value ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{label}</button>)}
        </div>
        <Select aria-label="Category" className="w-full sm:w-52" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input aria-label="Search products" placeholder="Product name, SKU or barcode" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
      </div>

      {q.isLoading || q.error || !data ? <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} />
        : !data.items.length ? <TableState empty filtered={!!term || show !== "all" || !!categoryId} onClearFilters={() => { setSearch(""); setShow("all"); setCategoryId(""); setPage(1); }} title="No products yet" hint="Add products in Inventory → Products first." />
        : (
        <div className="rounded-xl border border-border bg-card">
          <TableScroll label="Branch prices">
            <table className="w-full text-left text-sm" style={{ minWidth: 300 + branches.length * 220 }}>
              <thead className="text-xs text-muted"><tr>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 text-right font-medium">Default price</th>
                {branches.map((b) => <th key={b.id} className="border-l border-border px-4 py-2.5 font-medium">{b.name}{b.is_main && <span className="ml-1 font-normal">· Main</span>}{!b.editable && <span className="ml-1 font-normal">· view only</span>}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">{data.items.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3"><Link href={`/inventory/products/${row.id}`} className="font-medium hover:text-accent">{row.name}</Link><span className="block text-xs text-muted">{row.sku ?? "No SKU"}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.default_price)}</td>
                  {branches.map((b) => {
                    const c = cellOf(row, b.id);
                    const e = edits[key(row.id, b.id)];
                    const dirty = !!e && (e.is_available !== e.was.is_available || (e.price.trim() === "" ? null : Number(e.price)) !== e.was.price);
                    return (
                      <td key={b.id} className={`border-l border-border px-4 py-3 ${c.is_available ? "" : "bg-surface"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          {row.has_variants ? <span className="text-xs text-muted">Variant prices</span>
                            : <Input type="number" min={0} step="any" inputMode="decimal" aria-label={`${row.name} price in ${b.name}`}
                                className={`h-9 w-28 text-right tabular-nums ${dirty ? "border-accent" : ""}`} placeholder={String(row.default_price)} value={c.price}
                                disabled={!editable(b.id) || !c.is_available} onChange={(e) => edit(row, b.id, { price: e.target.value })} />}
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <Toggle checked={!c.is_available} onChange={(hidden) => edit(row, b.id, { is_available: !hidden })} disabled={!editable(b.id)} size="sm" label={`Hide ${row.name} in ${b.name}`} />Hidden
                          </span>
                        </div>
                        {!row.has_variants && c.is_available && c.price.trim() !== "" && Number(c.price) !== row.default_price && Number.isFinite(Number(c.price)) &&
                          <span className="mt-1 block text-xs text-muted tabular-nums">{Number(c.price) > row.default_price ? "+" : "−"}{fmt(Math.abs(Number(c.price) - row.default_price))} vs default</span>}
                      </td>
                    );
                  })}
                </tr>))}</tbody>
            </table>
          </TableScroll>
          <div className="border-t border-border px-4 py-3">
            <Pagination page={page} pageSize={pageSize} total={data.total} itemLabel="products"
              onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </div>
        </div>
      )}

      {canEdit && (changes.length > 0 || problem || saved != null) && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          {problem ? <p role="alert" className="mr-auto text-sm text-destructive">{problem}</p>
            : invalid ? <p role="alert" className="mr-auto text-sm text-destructive">{problems[0]}</p>
            : changes.length ? <p className="mr-auto text-sm text-muted">{changes.length} unsaved {changes.length === 1 ? "change" : "changes"}</p>
            : <p role="status" className="mr-auto text-sm text-muted">{saved} {saved === 1 ? "change" : "changes"} saved.</p>}
          <Button variant="secondary" disabled={!changes.length || save.isPending} onClick={() => { setEdits({}); setProblem(null); }}>Discard</Button>
          <Button disabled={!changes.length || invalid} loading={save.isPending} onClick={() => void submit()}>Save changes</Button>
        </div>
      )}
    </div>
  );
}
