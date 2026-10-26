"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { usePayablePurchases, useReceivePayable } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError, FinancialPagination } from "@/components/accounting/FinancialShared";
import { DebtDrawer } from "./DebtDrawer";
import { useDebtMoney } from "./DebtShared";
import { ManualDebtForm } from "./ManualDebtForm";

export function PayableCreate({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, manual?: boolean) => void }) {
  const { user, activeBranchId, hasPermission } = useAuth();
  const canManual = hasPermission("accounts_payable:create");
  const [mode, setMode] = useState<"purchase" | "manual">(hasPermission("purchase_orders:update") ? "purchase" : "manual");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const canRead = hasPermission("purchase_orders:read");
  const canReceive = hasPermission("purchase_orders:update") && hasPermission("accounts_payable:create");
  const purchases = usePayablePurchases(page, activeBranchId, user?.tenantId, canRead);
  const receive = useReceivePayable();
  const money = useDebtMoney();
  const today = new Date().toISOString().slice(0, 10);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (!selected || !dueDate) { setError("Select a purchase and its agreed due date."); return; }
    busy.current = true;
    setError("");
    try { const response = await receive.mutateAsync({ id: selected, dueDate }); onCreated(response.data.record.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not receive the purchase. Try again."); }
    finally { busy.current = false; }
  }
  return <DebtDrawer open onClose={() => { if (!busy.current) onClose(); }} title="Add Supplier Payable" size="lg"><div className="space-y-5 p-5">{canManual && <div role="tablist" aria-label="Payable type" className="flex rounded-lg border border-border p-1 text-xs font-semibold">{(["purchase", "manual"] as const).map(value => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={`flex-1 rounded-md px-3 py-2 ${mode === value ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{value === "purchase" ? "From a purchase" : "Direct payable"}</button>)}</div>}{mode === "manual" ? <ManualDebtForm kind="payable" onCancel={onClose} onCreated={id => onCreated(id, true)} /> : <form onSubmit={submit} className="space-y-5">
    <p className="text-xs leading-relaxed text-muted">Receive an existing purchase to create its supplier bill. This adds the goods to stock and records the amount owed. Only confirm goods you have received.</p>
    {hasPermission("purchase_orders:create") && <Link href="/procurement/orders?new=1" className="inline-flex rounded-lg border border-border px-3 py-2 text-xs font-semibold text-accent">Create new purchase</Link>}
    {!canRead ? <p className="text-xs text-muted">Purchase viewing permission is required to select a draft.</p> : purchases.isLoading ? <PageLoader variant="compact" /> : purchases.error ? <FinancialError error={purchases.error} /> : <>
      <fieldset disabled={receive.isPending} className="space-y-2"><legend className="mb-2 text-xs font-semibold">Select a draft purchase</legend>
        {purchases.data?.items.map(purchase => <label key={purchase.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${selected === purchase.id ? "border-accent bg-accent/5" : "border-border"}`}><input type="radio" name="purchase" value={purchase.id} checked={selected === purchase.id} onChange={() => setSelected(purchase.id)} /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{purchase.supplier}</span><span className="text-[11px] text-muted">{purchase.reference}</span></span><span className="text-xs font-semibold">{money(purchase.total, purchase.currency || purchases.data?.currency)}</span></label>)}
        {!purchases.data?.items.length && <p className="rounded-lg bg-surface p-4 text-xs text-muted">No draft purchases with a supplier in this branch. Create a purchase first, then return here to receive it.</p>}
      </fieldset>
      {purchases.data && purchases.data.total > 25 && <FinancialPagination page={page} total={purchases.data.total} size={25} onPage={value => { setPage(value); setSelected(""); }} />}
      {!!purchases.data?.items.length && <><Field label="Supplier bill due date"><Input aria-label="Supplier bill due date" required type="date" min={today} value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={receive.isPending} /></Field>
      {!canReceive && <p className="text-xs text-muted">Purchase update and payable creation permissions are required to receive goods.</p>}
      <Button type="submit" disabled={!canReceive || !selected || !dueDate || receive.isPending}>{receive.isPending ? "Receiving…" : "Receive goods & create payable"}</Button></>}
    </>}
    {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}
  </form>}</div></DebtDrawer>;
}
