"use client";

import { useState, useDeferredValue, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDebtDetail, useDebtOverview, useDebtPayment, useDebtRecords } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { DebtDrawer as Drawer } from "./DebtDrawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError, FinancialPagination } from "@/components/accounting/FinancialShared";
import { DebtHeader, DebtSummary } from "./DebtShared";
import { DebtTable } from "./DebtTable";
import { DebtDetails } from "./DebtDetails";
import { ReceivableCreate } from "./ReceivableCreate";
import { PayableCreate } from "./PayableCreate";
import { DebtUpcoming } from "./DebtUpcoming";
import type { DebtFilters, DebtKind, DebtRecord } from "./types";

const defaults: DebtFilters = { page: 1, search: "", status: "all", due_from: "", due_to: "" };
const resource = (kind: DebtKind) => kind === "receivable" ? "accounts_receivable" : "accounts_payable";
function Denied() { return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm text-muted">You don’t have permission to view these debts.</p>; }

export function DebtOverviewScreen() {
  const { user, activeBranchId } = useAuth();
  return <Overview key={`${user?.tenantId}:${activeBranchId ?? "all"}`} />;
}
function Overview() {
  const { user, activeBranchId, hasAnyPermission } = useAuth();
  const allowed = hasAnyPermission(["accounts_receivable:read", "accounts_payable:read"]);
  const query = useDebtOverview(activeBranchId, allowed, user?.tenantId);
  const values = query.data ? (["receivable", "payable"] as const).flatMap(kind => {
    const summary = query.data.totals[kind];
    return summary ? [{ label: `Total ${kind === "receivable" ? "Receivables" : "Payables"}`, value: summary.outstanding }] : [];
  }).concat((["receivable", "payable"] as const).flatMap(kind => {
    const summary = query.data.totals[kind];
    return summary ? [{ label: `Overdue (${kind === "receivable" ? "Receivables" : "Payables"})`, value: summary.overdue, overdue: true }] : [];
  })) : [];
  return <div className="space-y-5"><DebtHeader title="Debt Management" description="Track customer receivables and supplier payables in one place." />{!allowed ? <Denied /> : query.isLoading ? <PageLoader variant="page" /> : query.error ? <FinancialError error={query.error} /> : query.data && <><DebtSummary currency={query.data.currency} items={values} /><DebtUpcoming records={query.data.items} /></>}</div>;
}

export function DebtListScreen({ kind }: { kind: DebtKind }) {
  const { user, activeBranchId } = useAuth();
  return <DebtList key={`${user?.tenantId}:${kind}:${activeBranchId ?? "all"}`} kind={kind} />;
}
function DebtList({ kind }: { kind: DebtKind }) {
  const { user, activeBranchId, hasPermission } = useAuth();
  const allowed = hasPermission(`${resource(kind)}:read`);
  const canPay = hasPermission(`${resource(kind)}:create`);
  const canCreateSource = hasPermission(kind === "receivable" ? "orders:create" : "purchase_orders:create");
  const [filters, setFilters] = useState<DebtFilters>(defaults);
  const deferredFilters = useDeferredValue(filters);
  const query = useDebtRecords(kind, deferredFilters, activeBranchId, allowed, user?.tenantId);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [add, setAdd] = useState(false);
  const [notice, setNotice] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const detail = useDebtDetail(kind, selected, historyPage, activeBranchId, allowed, user?.tenantId);
  const payment = useDebtPayment();
  // A link from Overview selects a record without putting customer information into the URL.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("record");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) queueMicrotask(() => setSelected(id));
  }, []);
  function select(record: DebtRecord) { opener.current = document.activeElement as HTMLElement; setSelected(record.id); setHistoryPage(1); setNotice(""); }
  function close() { setSelected(null); opener.current?.focus(); }
  const label = kind === "receivable" ? "Receivable" : "Payable";
  return <div className="space-y-5">
    <DebtHeader title={`${label}s`} description={kind === "receivable" ? "Track customer debts and repayments." : "Track supplier debts and payments."} action={allowed && (canCreateSource || (kind === "payable" && hasPermission("purchase_orders:update") && canPay)) ? <Button onClick={() => setAdd(true)}><Plus size={15} />Add {label}</Button> : undefined} />
    {notice && <p role="status" className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-xs text-accent">{notice}</p>}
    {!allowed ? <Denied /> : query.isLoading ? <PageLoader variant="page" /> : <>
      {query.error && <div className="space-y-2"><FinancialError error={query.error} /><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>}
      {query.data && <><DebtSummary currency={query.data.currency} items={[{ label: "Total Outstanding", value: query.data.summary.outstanding }, { label: "Overdue Amount", value: query.data.summary.overdue, overdue: true }]} /><DebtTable kind={kind} records={query.data.items} total={query.data.total} filters={filters} onFilters={setFilters} onSelect={select} busy={query.isFetching} /></>}
      {!query.data && query.error && <DebtTable kind={kind} records={[]} total={0} filters={filters} onFilters={setFilters} onSelect={select} failed />}
    </>}
    {add && (kind === "payable" ? <PayableCreate onClose={() => setAdd(false)} onCreated={id => { setAdd(false); setSelected(id); setHistoryPage(1); setNotice("Supplier payable created. You can now record a payment."); }} /> : <ReceivableCreate onClose={() => setAdd(false)} onCreated={id => { setAdd(false); setSelected(id); setHistoryPage(1); setNotice(id ? "Receivable recorded. Stock and customer balances have been updated." : "Credit sale submitted for approval. Its receivable will appear after approval."); }} />)}
    {selected && (detail.isLoading ? <Drawer open onClose={close} title="Debt details"><div className="p-5"><PageLoader variant="compact" /></div></Drawer> : detail.error ? <Drawer open onClose={close} title="Debt details"><div className="p-5"><FinancialError error={detail.error} /></div></Drawer> : detail.data && <DebtDetails key={selected} record={detail.data.record} payments={detail.data.payments} onClose={close} canPay={canPay} supplierMetadataSupported onRecord={async data => { await payment.mutateAsync({ kind, id: selected, data }); setNotice("Payment recorded. Balances have been updated."); }} historyFooter={detail.data.payment_total > 25 ? <FinancialPagination page={historyPage} total={detail.data.payment_total} onPage={setHistoryPage} /> : undefined} />)}
  </div>;
}
