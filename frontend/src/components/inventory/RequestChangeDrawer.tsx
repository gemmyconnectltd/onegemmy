"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { useCreateApproval } from "@/lib/api/hooks";
import type { ApiProduct } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** For people who may not change a price or a stock count themselves: ask someone with authority, with a reason. */
export function RequestChangeDrawer({ product, canPrice, canStock, onClose }: { product: ApiProduct; canPrice: boolean; canStock: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const create = useCreateApproval();
  const [what, setWhat] = useState<"price_change" | "stock_adjustment">(canPrice ? "price_change" : "stock_adjustment");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const current = what === "price_change" ? product.price : product.stock;
  const valid = value.trim() !== "" && Number(value) >= 0 && reason.trim().length >= 5;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ kind: what, subject_id: product.id, branch_id: user?.branchId ?? null, reason: reason.trim(), ...(what === "price_change" ? { new_price: Number(value) } : { new_stock: Number(value) }) });
      setSent(true);
    } catch (err) { setError((err as { detail?: string })?.detail ?? "The request could not be sent."); }
  };
  return (
    <Drawer open onClose={onClose} title="Request a change" description={product.name} size="md">
      {sent ? (
        <div className="space-y-4 p-5"><p role="status" className="text-sm text-foreground">Sent. Someone with approval authority will decide, and you will see the answer under Approvals.</p><Button onClick={onClose}>Done</Button></div>
      ) : (
        <form onSubmit={submit} className="space-y-4 p-5">
          {canPrice && canStock && (
            <div role="group" aria-label="What to change" className="flex gap-1 rounded-lg border border-border p-1 text-sm font-semibold">
              {([["price_change", "Selling price"], ["stock_adjustment", "Stock count"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={what === k} onClick={() => { setWhat(k); setValue(""); }} className={`flex-1 rounded-md px-3 py-1.5 ${what === k ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{l}</button>)}
            </div>
          )}
          <p className="text-sm text-muted">{what === "price_change" ? "Current selling price" : "Recorded stock"}: <strong className="text-foreground">{Number(current).toLocaleString()}</strong></p>
          <Field label={what === "price_change" ? "New selling price" : "Counted stock"} required><Input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
          <Field label="Why" required hint="At least a few words, so the approver can decide."><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || create.isPending}>{create.isPending && <Loader2 size={13} className="animate-spin" />} Send request</Button></div>
        </form>
      )}
    </Drawer>
  );
}
