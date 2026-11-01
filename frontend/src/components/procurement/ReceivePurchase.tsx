"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Form";
import { TableWrap } from "@/components/ui/Table";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { PurchaseHeader } from "./PurchaseShared";
import { useConfirmGoodsReceipt } from "@/lib/api/hooks";
import type { PurchaseOrder } from "@/lib/api";
import { scaled } from "@/lib/purchaseAmounts";

export function ReceivePurchase({order}: {order: PurchaseOrder}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<unknown>(null);
  const mutation = useConfirmGoodsReceipt();
  const inFlight = useRef(false), reference = useRef("");
  const eligible = ["Approved", "Sent", "PartiallyReceived"].includes(order.status);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (inFlight.current) return;
    setError(null);
    const lines = order.items.filter(item => (scaled(quantities[item.id] || "0", 3) || BigInt(0)) > BigInt(0)).map(item => ({purchase_item_id: item.id, quantity: quantities[item.id]}));
    if (!lines.length || Object.values(quantities).some(value => value !== "" && scaled(value, 3) === null)) {setError({detail: "Enter a valid positive quantity for at least one item (up to three decimal places)."}); return;}
    if (!reference.current) reference.current = crypto.randomUUID();
    inFlight.current = true;
    try {await mutation.mutateAsync({id: order.id, data: {client_reference: reference.current, due_date: dueDate || null, lines}}); router.push(`/procurement/orders/${order.id}`);} catch (cause) {setError(cause);} finally {inFlight.current = false;}
  }
  return <form onSubmit={submit} className="space-y-5"><PurchaseHeader title={`Receive ${order.reference}`} description="Confirm only quantities delivered in this receipt. Stock and supplier liability are posted once." actions={<Button variant="outline" onClick={() => router.push(`/procurement/orders/${order.id}`)}>Back to order</Button>} />
    {!eligible ? <p role="alert">This order cannot receive goods in its current state.</p> : <fieldset disabled={mutation.isPending} className="space-y-4">
      <p className="text-sm text-muted">Supplier: {order.supplier?.name || "Not specified"} · Receiving branch: {order.branch_id || "Main branch"}. Inventory balances are held across the business.</p>
      <TableWrap><table className="w-full min-w-[640px] text-left text-sm"><thead><tr>{["Item", "Ordered", "Received", "Remaining", "Receive now"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{order.items.map(item => {
        const received = Number(item.received_quantity || 0), remaining = item.quantity - received;
        return <tr key={item.id}><td className="p-4">{item.product_name}<span className="block text-xs text-muted">{item.sku}</span></td><td className="p-4">{item.quantity}</td><td className="p-4">{received}</td><td className="p-4">{remaining}</td><td className="p-4"><Input aria-label={`Receive ${item.product_name}`} type="number" min="0" max={remaining} step="0.001" disabled={remaining <= 0} value={quantities[item.id] || ""} placeholder="0" onChange={event => {reference.current = ""; setQuantities(previous => ({...previous, [item.id]: event.target.value}));}} /></td></tr>;
      })}</tbody></table></TableWrap>
      <div className="max-w-sm"><Field label="Supplier bill due date" hint="Leave blank to use the order’s payment terms. A bill is created for this delivery only."><Input type="date" value={dueDate} onChange={event => {reference.current = ""; setDueDate(event.target.value);}} /></Field></div>
      <FinancialError error={error} /><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Confirming…" : "Confirm receipt & supplier bill"}</Button>
    </fieldset>}
  </form>;
}
