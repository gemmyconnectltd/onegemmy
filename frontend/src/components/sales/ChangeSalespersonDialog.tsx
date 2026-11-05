"use client";
import { useState } from "react";
import type { ApiOrder } from "@/lib/api";
import { useChangeSalesperson, useSalesTeam } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select, Textarea } from "@/components/ui/Form";

/** Re-credit a sale to another salesperson. Money and stock are untouched; the change and the reason go in the audit trail. */
export function ChangeSalespersonDialog({ order, onClose }: { order: ApiOrder; onClose: () => void }) {
  const team = useSalesTeam();
  const change = useChangeSalesperson();
  const [person, setPerson] = useState(order.salesperson_id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const same = person === (order.salesperson_id ?? "");
  const save = async () => {
    setError("");
    try { await change.mutateAsync({ id: order.id, salespersonId: person, reason: reason.trim() }); onClose(); }
    catch (cause) { setError((cause as { detail?: string })?.detail ?? "That didn't work. Please try again."); }
  };
  return (
    <Drawer open onClose={() => !change.isPending && onClose()} side="center" size="sm" title={`Change salesperson · ${order.order_number}`}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Currently credited to <span className="font-medium text-foreground">{order.salesperson_name ?? "nobody"}</span>. Only who gets the credit changes: money and stock stay as they are.</p>
        <Field label="Salesperson" required><Select value={person} onChange={(e) => setPerson(e.target.value)}>{!person && <option value="">Choose…</option>}{(team.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <Field label="Reason" required hint="Kept in the audit trail."><Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={change.isPending} onClick={onClose}>Cancel</Button><Button disabled={change.isPending || same || !person || reason.trim().length < 3} onClick={() => void save()}>{change.isPending ? "Saving…" : "Change salesperson"}</Button></div>
      </div>
    </Drawer>
  );
}
