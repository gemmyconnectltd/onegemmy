"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDebtStatement, useSendStatement } from "@/lib/api/hooks";
import { debtApi } from "@/lib/api/debts";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { DebtAging, DebtHeader, DebtSummary, debtDate, useDebtMoney } from "./DebtShared";
import { PartySearch, type Party } from "./PartySearch";
import type { DebtKind } from "./types";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const yearAgo = () => { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - 1); return iso(date); };

export function DebtStatementScreen() {
  const { user, activeBranchId, hasPermission } = useAuth();
  const params = useSearchParams();
  const readable = (["receivable", "payable"] as const).filter(kind => hasPermission(`accounts_${kind === "receivable" ? "receivable" : "payable"}:read`));
  const initialKind = params.get("kind") === "payable" ? "payable" : "receivable";
  const [kind, setKind] = useState<DebtKind>(readable.includes(initialKind) ? initialKind : readable[0] ?? "receivable");
  const [party, setParty] = useState<Party | null>(null);
  const [partyId, setPartyId] = useState<string | null>(/^[0-9a-f-]{36}$/i.test(params.get("party") ?? "") ? params.get("party") : null);
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(() => iso(new Date()));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const money = useDebtMoney();
  const send = useSendStatement();
  const query = useDebtStatement(kind, partyId, from, to, activeBranchId, user?.tenantId);
  const data = query.data;
  const canSend = kind === "receivable" && hasPermission("accounts_receivable:update");
  const badRange = from > to;
  async function download(format: "pdf" | "xlsx") {
    if (!partyId) return;
    setBusy(true);
    try { await debtApi.downloadStatement(kind, partyId, from, to, format); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not export the statement."); } finally { setBusy(false); }
  }
  async function email() {
    if (!partyId) return;
    try { await send.mutateAsync({ partyId, from, to }); setNotice("Statement emailed to the customer."); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not send the statement."); }
  }
  if (!readable.length) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm text-muted">You don’t have permission to view debt statements.</p>;
  return <div className="space-y-5">
    <DebtHeader title="Account statements" description="A running ledger of what a customer or supplier was billed, paid and still owes." />
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_1fr_9rem_9rem]">
      <label className="text-[11px] text-muted">Type<Select aria-label="Statement type" value={kind} onChange={e => { setKind(e.target.value as DebtKind); setParty(null); setPartyId(null); }}>{readable.map(value => <option key={value} value={value}>{value === "receivable" ? "Customer" : "Supplier"}</option>)}</Select></label>
      <div className="text-[11px] text-muted"><span className="mb-1 block">{kind === "receivable" ? "Customer" : "Supplier"}</span><PartySearch kind={kind} value={party ?? (data ? { id: data.party.id, name: data.party.name } : null)} onChange={next => { setParty(next); setPartyId(next?.id ?? null); }} /></div>
      <label className="text-[11px] text-muted">From<Input aria-label="From date" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
      <label className="text-[11px] text-muted">To<Input aria-label="To date" type="date" value={to} min={from} max={iso(new Date())} onChange={e => setTo(e.target.value)} /></label>
    </div>
    {badRange && <p role="alert" className="text-xs text-red-600">The from date must be on or before the to date.</p>}
    {notice && <p role="status" className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-xs text-accent">{notice}</p>}
    {!partyId ? <p className="rounded-xl border border-dashed border-border px-5 py-14 text-center text-sm text-muted">Choose a {kind === "receivable" ? "customer" : "supplier"} to see their statement.</p>
      : query.isLoading ? <PageLoader variant="page" /> : query.error ? <FinancialError error={query.error} /> : data && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">{data.party.name}</h2><p className="text-[11px] text-muted">{debtDate(data.date_from)} – {debtDate(data.date_to)} · {data.currency}</p></div>
          <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void download("xlsx")}><Download size={14} />Excel</Button><Button variant="secondary" disabled={busy} onClick={() => void download("pdf")}><Download size={14} />PDF</Button>{canSend && <Button disabled={send.isPending || !data.party.email} title={data.party.email ? undefined : "This customer has no email address"} onClick={() => void email()}><Mail size={14} />Send statement</Button>}</div></div>
        <DebtSummary currency={data.currency} items={[{ label: "Total billed", value: data.totals.billed }, { label: "Total paid", value: data.totals.paid }, { label: "Written off", value: data.totals.written_off }, { label: "Outstanding", value: data.totals.outstanding, overdue: Number(data.totals.outstanding) > 0 }]} />
        <DebtAging aging={data.aging} currency={data.currency} title="Outstanding by age" />
        <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full min-w-[720px] text-left text-[12px]">
          <caption className="sr-only">Statement ledger</caption>
          <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted"><tr>{["Date", "Reference", "Description", "Debit", "Credit", "Balance"].map((heading, i) => <th key={heading} scope="col" className={`px-4 py-3 font-medium ${i >= 3 ? "text-right" : ""}`}>{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            <tr className="bg-surface/50 font-medium"><td className="px-4 py-3" colSpan={5}>Opening balance</td><td className="px-4 py-3 text-right tabular-nums">{money(data.opening, data.currency)}</td></tr>
            {data.rows.map((row, index) => <tr key={`${row.reference}-${index}`}><td className="whitespace-nowrap px-4 py-3">{debtDate(row.date)}</td><td className="px-4 py-3">{row.reference}</td><td className="px-4 py-3 text-muted">{row.description}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{Number(row.debit) ? money(row.debit, data.currency) : "–"}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-accent">{Number(row.credit) ? money(row.credit, data.currency) : "–"}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{money(row.balance, data.currency)}</td></tr>)}
            {!data.rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No activity in this period.</td></tr>}
            <tr className="bg-surface/50 font-semibold"><td className="px-4 py-3" colSpan={5}>Closing balance</td><td className="px-4 py-3 text-right tabular-nums">{money(data.closing, data.currency)}</td></tr>
          </tbody></table></div>
      </>}
  </div>;
}
