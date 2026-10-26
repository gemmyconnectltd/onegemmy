"use client";

import { useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCreateManualDebt, useMyBranches } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { PartySearch, type Party } from "./PartySearch";
import { minorUnits, type DebtKind } from "./types";

/** Opening balance / direct debt: no stock moves and it is not counted as a product sale. */
export function ManualDebtForm({ kind, onCreated, onCancel }: { kind: DebtKind; onCreated: (id: string) => void; onCancel: () => void }) {
  const { activeBranchId, user } = useAuth();
  const branches = useMyBranches();
  const create = useCreateManualDebt();
  const today = new Date().toISOString().slice(0, 10);
  const [party, setParty] = useState<Party | null>(null);
  const [branch, setBranch] = useState(activeBranchId ?? user?.branchId ?? "");
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState(today);
  const [due, setDue] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  const minor = minorUnits(amount);
  const errors = {
    party: party ? null : `Choose a ${kind === "receivable" ? "customer" : "supplier"}.`,
    branch: branch ? null : "Choose the branch this debt belongs to.",
    amount: minor === null || minor <= BigInt(0) ? "Enter an amount greater than zero, with up to two decimals." : null,
    due: due && due < issue ? "The due date cannot be before the issue date." : null,
    issue: issue > today ? "The issue date cannot be in the future." : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (hasErrors || busy.current) return;
    busy.current = true; setError(null);
    try {
      const response = await create.mutateAsync({ kind, data: { party_id: party!.id, branch_id: branch, amount, issue_date: issue, ...(due ? { due_date: due } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) } });
      onCreated(response.data.id);
    } catch (cause) { setError(cause); } finally { busy.current = false; }
  }
  const note = (key: keyof typeof errors) => touched && errors[key] ? <span role="alert" className="mt-1 block text-[11px] text-red-600">{errors[key]}</span> : null;
  return <form onSubmit={submit} className="space-y-4" noValidate>
    <p className="text-xs leading-relaxed text-muted">{kind === "receivable" ? "Record money a customer already owes you, such as an opening balance. No stock is deducted and it is not counted as a sale." : "Record money you already owe a supplier, without creating a purchase. No stock is added."}</p>
    <div className="text-xs font-medium"><span className="mb-1 block">{kind === "receivable" ? "Customer" : "Supplier"}</span><PartySearch kind={kind} value={party} onChange={setParty} />{note("party")}</div>
    <label className="block text-xs font-medium">Branch<Select aria-label="Branch" value={branch} disabled={!!user?.branchId} onChange={e => setBranch(e.target.value)}><option value="">Select branch</option>{branches.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{note("branch")}</label>
    <label className="block text-xs font-medium">Amount<Input aria-label="Amount" inputMode="decimal" placeholder="0.00" aria-invalid={touched && !!errors.amount} value={amount} onChange={e => setAmount(e.target.value)} />{note("amount")}</label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-xs font-medium">Issue date<Input aria-label="Issue date" type="date" max={today} value={issue} onChange={e => setIssue(e.target.value)} />{note("issue")}</label>
      <label className="block text-xs font-medium">Due date<Input aria-label="Due date" type="date" min={issue} value={due} onChange={e => setDue(e.target.value)} />{note("due")}</label>
    </div>
    <label className="block text-xs font-medium">Reference (optional)<Input aria-label="Reference" maxLength={50} value={reference} onChange={e => setReference(e.target.value)} /></label>
    <label className="block text-xs font-medium">Notes (optional)<Textarea aria-label="Notes" rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <FinancialError error={error} />
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 size={14} className="animate-spin" />}Save {kind === "receivable" ? "receivable" : "payable"}</Button></div>
  </form>;
}
