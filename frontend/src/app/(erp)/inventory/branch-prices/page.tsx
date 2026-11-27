"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Search, Store, Tag } from "lucide-react";
import Link from "next/link";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useBranchPrices, useBranchPricingStatus, useCategories, useUpdateBranchPrices } from "@/lib/api/hooks";
import type { ApiBranchPriceRow, BranchPriceShow, BranchSettingInput } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { StatCard } from "@/components/ui/StatCard";
import { TableScroll } from "@/components/ui/TableScroll";
import { useAuth } from "@/lib/auth";
import { TableState } from "@/components/ui/TableState";
import { Toggle } from "@/components/ui/Toggle";

type Cell = { is_available: boolean; price: string };
/** An edited cell remembers what it was, so edits survive paging, search and filters until saved or discarded. */
type Edit = Cell & { product_id: string; branch_id: string; was: { is_available: boolean; price: number | null } };
const key = (productId: string, branchId: string) => `${productId}:${branchId}`;
const SHOW: [BranchPriceShow, string][] = [["all", "Show: All products"], ["differences", "Own price in a branch"], ["hidden", "Not sold in a branch"]];

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
  const { activeBranchId } = useAuth();
  const [picked, setBranchId] = useState("");
  const branchId = branches.some((x) => x.id === picked) ? picked
    : branches.find((x) => x.id === activeBranchId)?.id ?? (branches.find((x) => x.editable) ?? branches[0])?.id ?? "";

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
  const b = branches.find((x) => x.id === branchId) ?? null;
  const unsavedHere = b ? changes.filter((c) => c.branch_id === b.id).length : 0;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title text-foreground">Branch prices</h1>
          <p className="mt-0.5 text-sm text-muted">Pick a branch, then set its own price or stop selling a product there. A branch with no price of its own sells at the default price.</p>
        </div>
      </div>

      {data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Same price everywhere" value={(data.summary.products - data.summary.with_own_price).toLocaleString()} hint={`of ${data.summary.products} products`} icon={Tag} />
        <StatCard label="Own price in a branch" value={data.summary.with_own_price.toLocaleString()} hint="products" icon={Store} />
        <StatCard label="Not sold in a branch" value={data.summary.hidden_somewhere.toLocaleString()} hint="products" icon={EyeOff} tone={data.summary.hidden_somewhere ? "warning" : "default"} />
      </div>}

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 lg:flex-nowrap">
          <Select aria-label="Branch" className="min-w-0 flex-1 font-semibold sm:w-56 sm:flex-none" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!branches.length}>
            {branches.map((x) => {
              const n = changes.filter((c) => c.branch_id === x.id).length;
              return <option key={x.id} value={x.id}>{x.name}{x.is_main ? " · Main" : ""}{!x.editable ? " · view only" : ""}{n ? ` · ${n} unsaved` : ""}</option>;
            })}
          </Select>
          <div className="relative w-full lg:w-auto lg:min-w-[12rem] lg:flex-1">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input aria-label="Search products" placeholder="Product name, SKU or barcode" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select aria-label="Show" className="min-w-0 flex-1 sm:w-auto sm:flex-none" value={show} onChange={(e) => { setShow(e.target.value as BranchPriceShow); setPage(1); }}>
            {SHOW.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select aria-label="Category" className="min-w-0 flex-1 sm:w-48 sm:flex-none" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>

        {q.isLoading || q.error || !data ? <div className="p-4"><TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} /></div>
          : !data.items.length || !b ? <div className="p-4"><TableState empty filtered={!!term || show !== "all" || !!categoryId} onClearFilters={() => { setSearch(""); setShow("all"); setCategoryId(""); setPage(1); }} title="No products yet" hint="Add products in Inventory → Products first." /></div>
          : <>
            {!b.editable && <p className="border-b border-border bg-surface/50 px-4 py-2 text-xs text-muted">You can see {b.name}&apos;s prices but not change them.</p>}
            <TableScroll label={`Prices in ${b.name}`} mobileLayout="cards">
              <table className="w-full min-w-[640px]">
                <thead><tr>
                  <th scope="col" className="text-left">Product</th>
                  <th scope="col" className="text-right">Default price</th>
                  <th scope="col" className="text-right">Price in {b.name}</th>
                  <th scope="col" className="text-center">Sold in {b.name}</th>
                </tr></thead>
                <tbody>{data.items.map((row) => {
                  const c = cellOf(row, b.id);
                  const e = edits[key(row.id, b.id)];
                  const dirty = !!e && (e.is_available !== e.was.is_available || (e.price.trim() === "" ? null : Number(e.price)) !== e.was.price);
                  const own = c.price.trim() !== "" && Number.isFinite(Number(c.price)) && Number(c.price) !== row.default_price;
                  return (
                    <tr key={row.id} className={c.is_available ? "" : "bg-surface/60"}>
                      <td data-label="Product"><Link href={`/inventory/products/${row.id}`} className="font-semibold text-accent hover:underline">{row.name}</Link><p className="font-mono text-xs text-muted">{row.sku ?? "No SKU"}</p></td>
                      <td data-label="Default price" className="text-right tabular-nums text-muted">{fmt(row.default_price)}</td>
                      <td data-label={`Price in ${b.name}`} className="text-right">
                        {row.has_variants ? <span className="text-xs text-muted">Set on each variant</span> : <div className="inline-flex flex-col items-end gap-1">
                          <Input type="number" min={0} step="any" inputMode="decimal" aria-label={`${row.name} price in ${b.name}`}
                            className={`w-32 text-right tabular-nums ${dirty ? "border-accent ring-1 ring-accent/30" : ""}`} placeholder={String(row.default_price)} value={c.price}
                            disabled={!b.editable || !c.is_available} onChange={(ev) => edit(row, b.id, { price: ev.target.value })} />
                          {c.is_available && own ? <span className="text-xs tabular-nums text-muted">{Number(c.price) > row.default_price ? "+" : "−"}{fmt(Math.abs(Number(c.price) - row.default_price))} vs default
                            {b.editable && <button type="button" className="ml-2 text-accent hover:underline" onClick={() => edit(row, b.id, { price: "" })}>Use default</button>}</span>
                            : <span className="text-xs text-muted">{c.is_available ? "Default price" : "Not sold here"}</span>}
                        </div>}
                      </td>
                      <td data-label={`Sold in ${b.name}`} className="text-center">
                        <span className="inline-flex"><Toggle checked={c.is_available} onChange={(on) => edit(row, b.id, { is_available: on })} disabled={!b.editable} size="sm" label={`Sell ${row.name} in ${b.name}`} /></span>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </TableScroll>
            <Pagination page={page} pageSize={pageSize} total={data.total} itemLabel="products"
              onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>}
      </div>

      {canEdit && (changes.length > 0 || problem || saved != null) && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          {problem ? <p role="alert" className="mr-auto text-sm text-destructive">{problem}</p>
            : invalid ? <p role="alert" className="mr-auto text-sm text-destructive">{problems[0]}</p>
            : changes.length ? <p className="mr-auto text-sm text-muted">{changes.length} unsaved {changes.length === 1 ? "change" : "changes"}{changes.length > unsavedHere ? ` (${unsavedHere} in ${b?.name ?? "this branch"})` : ""}</p>
            : <p role="status" className="mr-auto text-sm text-muted">{saved} {saved === 1 ? "change" : "changes"} saved.</p>}
          <Button variant="secondary" disabled={!changes.length || save.isPending} onClick={() => { setEdits({}); setProblem(null); }}>Discard</Button>
          <Button disabled={!changes.length || invalid} loading={save.isPending} onClick={() => void submit()}>Save changes</Button>
        </div>
      )}
    </div>
  );
}
