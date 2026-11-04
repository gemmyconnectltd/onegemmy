"use client";
import { Input } from "@/components/ui/Form";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Package, Search } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useValuationReport } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { Button } from "@/components/ui/Button";
import { SerialsManager } from "@/components/inventory/SerialsManager";
import { BatchesManager } from "@/components/inventory/BatchesManager";

type StockTab = "levels" | "serials" | "batches";
type StatusFilter = "all" | "low" | "out" | "ok";

const TABS: { key: StockTab; label: string }[] = [
  { key: "levels", label: "Stock levels" },
  { key: "serials", label: "Serials" },
  { key: "batches", label: "Batches" },
];

function statusTone(status: string) {
  if (status === "out") return "bg-red-50 text-red-700";
  if (status === "low") return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-700";
}

function StockContent() {
  const params = useSearchParams();
  const { currencySymbol, brandColor } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const initialTab = (["levels", "serials", "batches"].includes(params.get("tab") || "")
    ? params.get("tab")
    : "levels") as StockTab;
  const initialStatus = (["all", "low", "out", "ok"].includes(params.get("status") || "")
    ? params.get("status")
    : "all") as StatusFilter;

  const [tab, setTab] = useState<StockTab>(initialTab);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [search, setSearch] = useState(params.get("q") || "");
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));
  const apiStatus = status === "all" ? "all" : status;
  const valuation = useValuationReport(page, apiStatus);
  const summary = valuation.data?.summary;
  const lines = useMemo(() => {
    const items = valuation.data?.lines ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (line) =>
        line.name.toLowerCase().includes(q) ||
        (line.sku || "").toLowerCase().includes(q) ||
        (line.category || "").toLowerCase().includes(q) ||
        (line.brand || "").toLowerCase().includes(q),
    );
  }, [valuation.data?.lines, search]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (tab !== "levels") next.set("tab", tab);
    if (status !== "all") next.set("status", status);
    if (search) next.set("q", search);
    if (page !== 1) next.set("page", String(page));
    const query = next.toString();
    window.history.replaceState(null, "", `/inventory/stock${query ? `?${query}` : ""}`);
  }, [tab, status, search, page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title">Stock</h1>
          <p className="mt-0.5 text-sm text-muted">
            Business-wide quantities, low-stock alerts, serials and batches. Stock follows existing posting rules.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/products">
            <Button variant="secondary">Products</Button>
          </Link>
          <Link href="/inventory/transfers">
            <Button variant="secondary">Transfers</Button>
          </Link>
        </div>
      </div>

      {summary && tab === "levels" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Lines tracked", summary.line_count],
            ["Units on hand", summary.total_units],
            ["Low stock", summary.low_stock_count],
            ["Out of stock", summary.out_of_stock_count],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div role="tablist" aria-label="Stock sections" className="flex gap-4 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => {
              setTab(item.key);
              setPage(1);
            }}
            className={`min-h-11 shrink-0 border-b-2 px-1 text-sm font-semibold ${
              tab === item.key ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "serials" && <SerialsManager embedded />}
      {tab === "batches" && <BatchesManager embedded />}

      {tab === "levels" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-4 py-4 pesaa-responsive-toolbar sm:px-5">
            <div className="relative max-w-xs flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search stock lines..." aria-label="Search stock lines" className="w-full pl-9" />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
              {(["all", "ok", "low", "out"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                  style={status === value ? { backgroundColor: brandColor } : {}}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    status === value ? "text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {value === "ok" ? "In stock" : value}
                </button>
              ))}
            </div>
          </div>

          {valuation.isLoading ? (
            <PageLoader variant="compact" />
          ) : valuation.error ? (
            <p role="alert" className="p-5 text-sm text-red-600">
              Could not load stock levels.
            </p>
          ) : (
            <>
              <div className="md:hidden">
                <div className="grid gap-3 p-3 sm:grid-cols-2">
                  {lines.map((line) => (
                    <article key={line.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {line.product_id ? (
                            <Link
                              href={`/inventory/products/${line.product_id}`}
                              className="break-words text-sm font-semibold text-accent hover:underline"
                            >
                              {line.name}
                            </Link>
                          ) : (
                            <p className="break-words text-sm font-semibold">{line.name}</p>
                          )}
                          <p className="mt-1 break-all text-xs text-muted">{line.sku || "No SKU"}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone(line.status)}`}>
                          {line.status}
                        </span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted">Stock</dt>
                          <dd className="font-semibold tabular-nums">{line.stock}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Min</dt>
                          <dd className="tabular-nums">{line.min_stock}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Cost value</dt>
                          <dd className="tabular-nums">{fmt(line.cost_value)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Retail value</dt>
                          <dd className="tabular-nums">{fmt(line.retail_value)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                  {!lines.length && <p className="p-4 text-sm text-muted">No stock lines match these filters.</p>}
                </div>
              </div>

              <div className={`hidden md:block overflow-x-auto transition-opacity ${valuation.isFetching ? "opacity-60" : ""}`}>
                <TableScroll>
                  <table className="w-full min-w-160">
                    <thead>
                      <tr className="border-b border-border bg-surface/50 text-left">
                        {["Product / variant", "Category", "Stock", "Min", "Cost value", "Retail value", "Status"].map((label) => (
                          <th
                            key={label}
                            className={`p-4 text-xs font-semibold text-muted ${
                              ["Stock", "Min", "Cost value", "Retail value"].includes(label) ? "text-right" : ""
                            }`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lines.map((line) => (
                        <tr key={line.id} className="hover:bg-surface/40">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted">
                                <Package size={14} />
                              </span>
                              <div>
                                {line.product_id ? (
                                  <Link
                                    href={`/inventory/products/${line.product_id}`}
                                    className="text-sm font-semibold text-foreground hover:underline"
                                  >
                                    {line.name}
                                  </Link>
                                ) : (
                                  <p className="text-sm font-semibold">{line.name}</p>
                                )}
                                <p className="font-mono text-xs text-muted">{line.sku || "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-muted">{line.category || "—"}</td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums">{line.stock}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-muted">{line.min_stock}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums">{fmt(line.cost_value)}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums">{fmt(line.retail_value)}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone(line.status)}`}>
                              {line.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!lines.length && (
                        <tr>
                          <td colSpan={7} className="px-5 py-16 text-center text-sm text-muted">
                            No stock lines match these filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableScroll>
              </div>

              <Pagination
                page={page}
                pageSize={valuation.data?.page_size ?? 50}
                total={valuation.data?.total ?? 0}
                onPageChange={setPage}
                itemLabel="stock lines"
                color={brandColor}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={<PageLoader variant="page" />}>
      <StockContent />
    </Suspense>
  );
}
