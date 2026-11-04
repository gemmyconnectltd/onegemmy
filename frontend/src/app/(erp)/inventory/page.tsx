"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRightLeft, Package, PackageX, Wallet } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useCan } from "@/lib/can";
import { useLowStockReport, useTransfers, useValuationReport } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableWrap } from "@/components/ui/Table";
import { fmtDate } from "@/lib/date";

function KpiCard({
  href,
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  href: string;
  label: string;
  value: string | number;
  hint: string;
  tone?: "default" | "warning" | "danger";
  icon: typeof Package;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/60"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/60"
        : "border-border bg-card";
  return (
    <Link
      href={href}
      className={`block min-w-0 rounded-xl border p-4 transition-colors hover:border-accent/40 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
        <span className="rounded-lg bg-accent/10 p-2.5 text-accent">
          <Icon size={18} />
        </span>
      </div>
    </Link>
  );
}

export default function InventoryOverviewPage() {
  const { currencySymbol, t } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const can = useCan();
  const valuation = useValuationReport(1, "all");
  const lowStock = useLowStockReport();
  const pendingTransfers = useTransfers(1, 5, "pending");
  const recentTransfers = useTransfers(1, 5);

  const summary = valuation.data?.summary;
  const canAdd = can("items", "create");
  const canTransfer = can("stock", "create");

  if (valuation.isLoading && !valuation.data) return <PageLoader variant="page" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title">{t("inventoryOverview")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("inventoryOverviewSub")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory/products">
            <Button variant="secondary">View products</Button>
          </Link>
          {canTransfer && (
            <Link href="/inventory/transfers?create=1">
              <Button variant="secondary">
                <ArrowRightLeft size={15} /> New transfer
              </Button>
            </Link>
          )}
          {canAdd && (
            <Link href="/inventory/products">
              <Button>
                <Package size={15} /> Add product
              </Button>
            </Link>
          )}
        </div>
      </div>

      {valuation.error ? (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-red-600">
          Could not load inventory summary. Try refreshing the page.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            href="/inventory/products"
            label={t("totalProducts")}
            value={summary?.product_count ?? 0}
            hint={t("skusTracked")}
            icon={Package}
          />
          <KpiCard
            href="/inventory/stock"
            label={t("stockValue")}
            value={fmt(summary?.cost_value ?? 0)}
            hint={t("atCostPrice")}
            icon={Wallet}
          />
          <KpiCard
            href="/inventory/stock?status=low"
            label={t("lowStock")}
            value={summary?.low_stock_count ?? 0}
            hint={t("needReorder")}
            tone={(summary?.low_stock_count ?? 0) > 0 ? "warning" : "default"}
            icon={AlertTriangle}
          />
          <KpiCard
            href="/inventory/stock?status=out"
            label={t("outOfStock")}
            value={summary?.out_of_stock_count ?? 0}
            hint={t("immediateAction")}
            tone={(summary?.out_of_stock_count ?? 0) > 0 ? "danger" : "default"}
            icon={PackageX}
          />
          <KpiCard
            href="/inventory/transfers?status=pending"
            label="Pending transfers"
            value={pendingTransfers.data?.total ?? 0}
            hint="Awaiting dispatch or receipt"
            tone={(pendingTransfers.data?.total ?? 0) > 0 ? "warning" : "default"}
            icon={ArrowRightLeft}
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="pesaa-card-title">Inventory alerts</h2>
            <Link href="/inventory/stock?status=low" className="text-sm font-semibold text-accent hover:underline">
              View stock
            </Link>
          </div>
          {lowStock.isLoading ? (
            <PageLoader variant="compact" />
          ) : lowStock.error ? (
            <p className="text-sm text-muted">Alerts unavailable right now.</p>
          ) : !(lowStock.data?.items.length) ? (
            <p className="text-sm text-muted">No low-stock products right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.data.items.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <Link href={`/inventory/products/${item.id}`} className="min-w-0 font-semibold text-accent hover:underline">
                    <span className="break-words">{item.name}</span>
                  </Link>
                  <span className={`shrink-0 tabular-nums ${item.stock <= 0 ? "font-semibold text-red-600" : "text-amber-700"}`}>
                    {item.stock} / min {item.min_stock}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(lowStock.data?.total ?? 0) > 8 && (
            <p className="text-xs text-muted">{lowStock.data!.total - 8} more products need attention.</p>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="pesaa-card-title">Recent transfers</h2>
            <Link href="/inventory/transfers" className="text-sm font-semibold text-accent hover:underline">
              View all
            </Link>
          </div>
          {recentTransfers.isLoading ? (
            <PageLoader variant="compact" />
          ) : recentTransfers.error ? (
            <p className="text-sm text-muted">Transfers unavailable right now.</p>
          ) : !(recentTransfers.data?.items.length) ? (
            <p className="text-sm text-muted">No stock transfers yet.</p>
          ) : (
            <TableWrap>
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr>
                    {["Transfer", "Status", "Date"].map((label) => (
                      <th key={label} className="p-3 text-xs font-semibold text-muted">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentTransfers.data.items.map((transfer) => (
                    <tr key={transfer.id}>
                      <td className="p-3">
                        <Link href={`/inventory/transfers/${transfer.id}`} className="font-semibold text-accent hover:underline">
                          {transfer.transfer_number || transfer.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="p-3 capitalize text-muted">{transfer.status.replaceAll("_", " ")}</td>
                      <td className="p-3 text-muted">{fmtDate(transfer.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>
      </div>

      {summary && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="pesaa-card-title">Stock health</h2>
              <p className="mt-1 text-sm text-muted">
                {summary.total_units} units on hand · retail value {fmt(summary.retail_value)}
                {summary.margin_pct != null ? ` · margin ${summary.margin_pct.toFixed(1)}%` : ""}
              </p>
            </div>
            <Link href="/inventory/stock">
              <Button variant="secondary">Open stock workspace</Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
