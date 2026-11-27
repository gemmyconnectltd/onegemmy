"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Package, PackageX, Plus, Truck, Wallet, Warehouse as WarehouseIcon } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/can";
import { useBranchStockSummary, useMyBranches, useProducts, useSetupWarehouses, useStockCounts, useTransfers, useUpdateTransfer, useValuationReport, useWarehouses } from "@/lib/api/hooks";
import type { ApiProduct, ApiStockTransfer } from "@/lib/api";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtDate } from "@/lib/date";
import { type BranchStockRow } from "@/lib/api/branchStock";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { StatCard } from "@/components/ui/StatCard";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { LoadError } from "@/components/ui/LoadState";
import { BranchesTable, ReceiveStock, StockPill } from "@/components/inventory/BranchStock";
import { ProductAvatar } from "@/components/inventory/ProductAvatar";

const CARD = "min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm";

/** Inventory overview: the stock at a glance for the branch chosen in the top bar (or every branch the person may see); it never
 *  switches branches itself. Title and actions, four summary cards (Units, Low and Out open Products with that stock filter),
 *  what needs attention (counts to approve, transfers on their way), "Stock by branch" with several branches, and transfers.
 *  The products themselves are listed on Products. */
function Overview() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const can = useCan();
  const { activeBranchId, hasPermission } = useAuth();
  const router = useRouter();
  const warehouses = useWarehouses();
  const usesWarehouses = !!warehouses.data?.enabled;
  const summary = useBranchStockSummary(1, "name", false, { enabled: usesWarehouses }, 500);
  const allRows = useMemo(() => summary.data?.items ?? [], [summary.data]);
  const branchRows = useMemo(() => allRows.filter((r): r is BranchStockRow & { branch_id: string } => !!r.branch_id), [allRows]);
  const several = branchRows.length > 1;
  const open = activeBranchId ? branchRows.find((r) => r.branch_id === activeBranchId) ?? null : !several ? branchRows[0] ?? null : null;
  const branchFailed = usesWarehouses && !!summary.error && !summary.data;
  const view: "simple" | "all" | "branch" = !usesWarehouses || branchFailed ? "simple" : open ? "branch" : "all";

  // The Low / Out / Units cards open Products with that stock filter (it lists every product with its stock).
  const stockHref = (v: "in" | "low" | "out") => `/inventory/products?stock=${v}`;
  const valuation = useValuationReport(1, "all", { enabled: warehouses.isSuccess && view === "simple" }, undefined, 1);
  const transfers = useTransfers(1, 50, undefined, { enabled: warehouses.isSuccess });
  const myBranches = useMyBranches({ enabled: warehouses.isSuccess && !usesWarehouses });
  const counts = useStockCounts(1, "Submitted");

  if (warehouses.isLoading || (usesWarehouses && summary.isLoading)) return <PageLoader variant="page" />;
  if (warehouses.error) return <LoadError title="Could not load inventory" error={warehouses.error} onRetry={() => void warehouses.refetch()} />;

  const totals = summary.data?.summary.totals;
  const vs = valuation.data?.summary;
  const named = view === "branch" && several ? open!.name : null;  // "in Kayonza" only says something when there are several
  const row = view === "branch" ? open! : null;
  const n = view === "simple"
    ? { value: vs?.cost_value ?? 0, retail: vs?.retail_value ?? 0, units: Number(vs?.total_units ?? 0), products: vs?.product_count ?? 0, low: vs?.low_stock_count ?? 0, out: vs?.out_of_stock_count ?? 0 }
    : { value: row?.value_cost ?? totals?.value_cost ?? 0, retail: row?.value_retail ?? totals?.value_retail ?? 0, units: row?.units ?? totals?.units ?? 0,
        products: row?.products ?? totals?.products ?? 0, low: row?.low ?? totals?.low ?? 0, out: row?.out ?? totals?.out ?? 0 };
  const statsLoading = view === "simple" && valuation.isLoading && !vs;
  const moving = (transfers.data?.items ?? []).filter((t) => view !== "branch" || t.from_branch_id === open!.branch_id || t.to_branch_id === open!.branch_id);
  const arriving = moving.filter((t) => t.status === "in_transit" && (view !== "branch" || t.to_branch_id === row?.branch_id));
  const waitingCounts = can("stock", "approve") ? counts.data?.total ?? 0 : 0;
  const canMove = can("stock", "create");
  const where = named ? `in ${named}` : view === "all" ? "in all your branches" : "";

  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3 pesaa-responsive-toolbar">
      <div className="min-w-0">
        <h1 className="pesaa-page-title text-foreground">{named ? `Inventory · ${named}` : "Inventory"}</h1>
        <p className="mt-0.5 text-sm text-muted">What is in stock {where ? `${where} ` : ""}right now, and what is running short.{several ? " The branch follows the selector in the top bar." : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {can("items", "create") && <Link href="/inventory/products?create=1"><Button variant={usesWarehouses && canMove ? "secondary" : "default"}><Plus size={15} /> Add product</Button></Link>}
        {usesWarehouses && canMove && <ReceiveStock warehouses={warehouses.data?.items ?? []} branchId={open?.branch_id ?? null} />}
      </div>
    </div>

    {branchFailed && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span>Stock by branch could not load, so these are the figures you may see across your branches.</span>
      <Button variant="outline" size="sm" onClick={() => void summary.refetch()}>Try again</Button>
    </div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Stock value at cost" value={fmt(n.value)} hint={`Retail ${fmt(n.retail)}`} icon={Wallet} loading={statsLoading} />
      <StatCard label="Units on hand" value={n.units.toLocaleString()} hint={view === "simple" ? `${n.products} products` : `${n.products.toLocaleString()} of ${(totals?.catalogue ?? n.products).toLocaleString()} products in stock`} icon={Package} href={stockHref("in")} loading={statsLoading} />
      <StatCard label="Low stock" value={String(n.low)} hint={named ? `Below ${named}'s reorder level` : "Below the reorder level"} icon={AlertTriangle} tone={n.low ? "warning" : "default"} href={stockHref("low")} loading={statsLoading} />
      <StatCard label="Out of stock" value={String(n.out)} hint="Had stock, none left now" icon={PackageX} tone={n.out ? "danger" : "default"} href={stockHref("out")} loading={statsLoading} />
    </div>

    {waitingCounts > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span>{waitingCounts} stock count{waitingCounts === 1 ? " is" : "s are"} waiting for your approval.</span>
      <Link href="/inventory/counts"><Button variant="secondary" size="sm">Review</Button></Link>
    </div>}
    {arriving.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
      <span className="inline-flex items-center gap-2"><Truck size={16} aria-hidden />
        {arriving.length === 1 ? <>{arriving[0].transfer_number} is on the way to {arriving[0].to_branch_name ?? "a branch"} from {arriving[0].from_branch_name ?? "another branch"}: {arriving[0].items.reduce((s, it) => s + Number(it.quantity), 0).toLocaleString()} units.</>
          : <>{arriving.length} transfers are on the way.</>} {arriving.length === 1 ? "Receive it" : "Receive each one"} when it arrives so the stock counts.</span>
      <a href="#transfers-title"><Button variant="secondary" size="sm">See transfers</Button></a>
    </div>}

    {/* A branch opens Products showing that branch's products and stock. */}
    {!usesWarehouses && (myBranches.data?.items.length ?? 0) > 1 && hasPermission("warehouses:create") && <SetupBranchStock branches={myBranches.data!.items.length} />}

    <NeedsAttention named={named} />

    {view === "all" && allRows.length > 1 && <BranchesTable rows={allRows} fmt={fmt} onOpen={(id) => router.push(`/inventory/products?branch=${id}`)} openLabel="View products" />}
    {(usesWarehouses || moving.length > 0) && <TransfersCard rows={moving.slice(0, 5)} named={named} branchId={row?.branch_id ?? null} loading={transfers.isLoading} error={transfers.error}
      onRetry={() => void transfers.refetch()} canReceive={canMove} />}
  </div>;
}

/** A business with several branches but one stock figure: what switching on stock by branch does, and the switch. */
function SetupBranchStock({ branches }: { branches: number }) {
  const setup = useSetupWarehouses();
  const { confirm, dialog } = useConfirmDialog();
  const [problem, setProblem] = useState("");
  return <section aria-labelledby="setup-title" className={`${CARD} flex flex-col gap-4 p-4 sm:flex-row sm:items-center`}>
    {dialog}
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><WarehouseIcon size={20} aria-hidden /></span>
    <div className="min-w-0 flex-1">
      <h2 id="setup-title" className="pesaa-card-title">Keep stock per branch</h2>
      <p className="mt-0.5 text-sm text-muted">Your {branches} branches share one stock figure today. With stock by branch, each branch has its own stock and sells only what it holds.</p>
      {problem && <p role="alert" className="mt-1 text-sm text-red-600">{problem}</p>}
    </div>
    <Button className="shrink-0" loading={setup.isPending} onClick={() => confirm({
      title: "Set up stock by branch?", confirmLabel: "Set up",
      message: "Everything in stock now goes into your main branch's warehouse, and every other branch gets an empty warehouse of its own. Until you move stock to a branch with a transfer, that branch has nothing to sell. You can't switch this back off.",
      onConfirm: async () => { setProblem(""); try { await setup.mutateAsync(undefined); } catch (e) { setProblem((e as { detail?: string })?.detail ?? "Stock by branch could not be set up."); } },
    })}>Set up stock by branch</Button>
  </section>;
}

/** What needs doing first: up to five products out of stock and five running low (in the branch shown), each opening the
 *  product, with links to the full filtered list on Products. */
function NeedsAttention({ named }: { named: string | null }) {
  const out = useProducts(1, 5, undefined, true, undefined, undefined, undefined, undefined, undefined, false, { stock: "out" });
  const low = useProducts(1, 5, undefined, true, undefined, undefined, undefined, undefined, undefined, false, { stock: "low" });
  const outN = out.data?.total ?? 0, lowN = low.data?.total ?? 0;
  const loading = out.isLoading || low.isLoading;
  const rows: [ApiProduct, "out" | "low"][] = [...(out.data?.items ?? []).map((p) => [p, "out"] as [ApiProduct, "out"]), ...(low.data?.items ?? []).map((p) => [p, "low"] as [ApiProduct, "low"])];
  const qty = (p: ApiProduct) => (p.has_variants && p.variants?.length ? p.variants.reduce((n, v) => n + v.stock, 0) : p.stock);
  return <section aria-labelledby="attention-title" className={CARD}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <h2 id="attention-title" className="pesaa-card-title">Needs attention{named ? ` in ${named}` : ""}</h2>
      <div className="flex flex-wrap gap-3 text-sm">
        {outN > 0 && <Link href="/inventory/products?stock=out" className="font-medium text-accent hover:underline">All {outN} out of stock</Link>}
        {lowN > 0 && <Link href="/inventory/products?stock=low" className="font-medium text-accent hover:underline">All {lowN} running low</Link>}
      </div>
    </div>
    {loading || out.error || low.error || !rows.length ? <div className="p-4"><TableState loading={loading} error={out.error ?? low.error ?? undefined} onRetry={() => { void out.refetch(); void low.refetch(); }}
      empty={!rows.length} title="Nothing needs attention" hint="No product is out of stock or below its reorder level." /></div> :
      <ul className="divide-y divide-border">{rows.map(([p, st]) => <li key={`${st}:${p.id}`}>
        <Link href={`/inventory/products/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-accent">
          <ProductAvatar name={p.name} imageUrl={p.image_url} size={32} className="shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block font-mono text-xs text-muted">{p.sku || "No SKU"}</span></span>
          <span className="hidden text-xs text-muted sm:block">Reorder at {Number(p.min_stock ?? 0).toLocaleString()}</span>
          <span className="inline-flex w-24 shrink-0 items-center justify-end gap-2"><StockPill status={st} /><span className="font-semibold tabular-nums">{qty(p).toLocaleString()}</span></span>
          <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
        </Link></li>)}</ul>}
  </section>;
}

const TRANSFER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  in_transit: { label: "On the way", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" },
  completed: { label: "Received", cls: "bg-accent/10 text-accent" },
  cancelled: { label: "Cancelled", cls: "bg-surface text-muted ring-1 ring-border" },
};

/** "Transfers in and out of <branch>": the latest five, with "Receive" on the ones on their way to it. */
function TransfersCard({ rows, named, branchId, loading, error, onRetry, canReceive }: {
  rows: ApiStockTransfer[]; named: string | null; branchId: string | null; loading: boolean; error: unknown; onRetry: () => void; canReceive: boolean;
}) {
  const update = useUpdateTransfer();
  const { confirm, dialog } = useConfirmDialog();
  const [failed, setFailed] = useState("");
  const receive = (t: ApiStockTransfer) => confirm({
    title: `Receive ${t.transfer_number}?`, confirmLabel: "Receive",
    message: `${t.items.map((it) => `${Number(it.quantity).toLocaleString()} × ${it.product_name}`).join(", ")} arrive in ${t.to_warehouse_name ?? t.to_branch_name ?? "the branch"}.`,
    onConfirm: async () => { setFailed(""); try { await update.mutateAsync({ id: t.id, data: { status: "completed" } }); } catch (e) { setFailed((e as { detail?: string })?.detail ?? "Couldn't receive the transfer."); } },
  });
  return <section aria-labelledby="transfers-title" className={CARD}>
    {dialog}
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><h2 id="transfers-title" className="pesaa-card-title">{named ? `Transfers in and out of ${named}` : "Latest transfers"}</h2><Link href="/inventory/transfers" className="text-sm font-medium text-accent hover:underline">View all</Link></div>
    {failed && <p role="alert" className="px-4 pb-2 text-sm text-red-600">{failed}</p>}
    {loading || error || !rows.length ? <div className="p-4"><TableState loading={loading} error={error ?? undefined} onRetry={onRetry} empty={!rows.length} title="No transfers yet" hint="Stock moved between branches shows here." /></div> :
      <TableScroll label="Transfers" mobileLayout="cards"><table className="min-w-[680px]">
        <thead><tr><th scope="col" className="text-left">Transfer</th><th scope="col" className="text-left">From</th><th scope="col" className="text-left">To</th><th scope="col" className="text-left">Items</th><th scope="col" className="text-left">Status</th><th scope="col" className="text-left">Date</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{rows.map((t) => {
          const units = t.items.reduce((n, it) => n + Number(it.quantity), 0);
          const st = TRANSFER_STATUS[t.status] ?? { label: t.status, cls: "bg-surface text-muted" };
          const mine = !branchId || t.to_branch_id === branchId;
          return <tr key={t.id}>
            <td data-label="Transfer"><Link href={`/inventory/transfers/${t.id}`} className="font-semibold text-accent hover:underline">{t.transfer_number}</Link></td>
            <td data-label="From">{t.from_branch_name ?? t.from_warehouse_name ?? "—"}</td>
            <td data-label="To">{t.to_branch_name ?? t.to_warehouse_name ?? "—"}</td>
            <td data-label="Items" className="text-muted">{units.toLocaleString()} unit{units === 1 ? "" : "s"} · {t.items.length} product{t.items.length === 1 ? "" : "s"}</td>
            <td data-label="Status"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
            <td data-label="Date" className="text-muted">{fmtDate(t.dispatched_at ?? t.created_at)}</td>
            <td data-label="" className="text-right">{canReceive && mine && t.status === "in_transit" && <Button size="sm" disabled={update.isPending} onClick={() => receive(t)}>Receive</Button>}</td>
          </tr>;
        })}</tbody>
      </table></TableScroll>}
  </section>;
}

export default function InventoryOverviewPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><Overview /></Suspense>;
}
