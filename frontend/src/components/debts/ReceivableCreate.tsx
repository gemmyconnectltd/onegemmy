"use client";

import { useDeferredValue, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCreateOrder, useCustomers, useProducts, useSerials } from "@/lib/api/hooks";
import type { ApiProduct } from "@/lib/api/inventory";
import { purchaseLineMinor, scaled } from "@/lib/purchaseAmounts";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError, FinancialPagination } from "@/components/accounting/FinancialShared";
import { DebtDrawer } from "./DebtDrawer";
import { useDebtMoney } from "./DebtShared";

type Line = { key: string; product: ApiProduct; variant: string; price: string; quantity: string; serials: string[] };
export function ReceivableCreate({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string | null) => void }) {
  const { activeBranchId, user } = useAuth();
  const money = useDebtMoney();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [customerPage, setCustomerPage] = useState(1);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const customers = useCustomers(customerPage, 25, useDeferredValue(customerSearch));
  const products = useProducts(page, 25, useDeferredValue(search), true);
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("0");
  const [due, setDue] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const busy = useRef(false);
  const create = useCreateOrder();
  const totals = lines.map(line => purchaseLineMinor(line.price, line.quantity));
  const total = totals.reduce<bigint>((sum, value) => sum + (value ?? BigInt(0)), BigInt(0));
  const paidMinor = scaled(paid, 2);
  const outstanding = total - (paidMinor ?? BigInt(0));
  function update(id: string, patch: Partial<Line>) { setLines(current => current.map(line => line.key === id ? { ...line, ...patch } : line)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (!customer || !due || !lines.length || totals.some(value => value === null) || paidMinor === null || outstanding <= BigInt(0) || lines.some(line => (line.product.has_variants && !line.variant) || (line.product.tracks_serials && line.serials.length !== Number(line.quantity)))) {
      setError("Choose a customer and items, select any required variants and serial numbers, and enter a due date. The amount paid must be less than the sale total."); return;
    }
    busy.current = true; setError("");
    key.current ??= crypto.randomUUID();
    try {
      const response = await create.mutateAsync({ customer_id: customer.id, branch_id: activeBranchId ?? user?.branchId ?? undefined, status: "Completed", client_order_id: key.current, amount_paid: Number(paid), payment_method: method, due_date: due, notes: notes || undefined, items: lines.map(line => ({ product_id: line.product.id, variant_id: line.variant || undefined, product_name: line.product.name, sku: line.product.variants?.find(variant => variant.id === line.variant)?.sku ?? line.product.sku, unit_price: Number(line.price), quantity: Number(line.quantity), discount: 0, variant_attributes: line.product.variants?.find(variant => variant.id === line.variant)?.attributes, serial_ids: line.serials })) });
      onCreated(response.data.status === "Completed" ? response.data.id : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record the receivable. Try again."); }
    finally { busy.current = false; }
  }
  return <DebtDrawer open onClose={() => { if (!busy.current) onClose(); }} title="Record Receivable" size="lg"><form onSubmit={submit} className="space-y-5 p-5">
    <p className="text-xs leading-relaxed text-muted">Record a credit sale here. Saving updates stock and records the customer’s unpaid balance.</p>
    <fieldset disabled={create.isPending} className="space-y-5">
      <section className="space-y-2"><Field label="Customer" required><Input aria-label="Search customers" placeholder="Search customers…" value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerPage(1); }} /></Field>

        {customers.isLoading ? <PageLoader variant="compact" /> : customers.error ? <FinancialError error={customers.error} /> : <><Select aria-label="Customer" required value={customer?.id ?? ""} onChange={event => { const item = customers.data?.items.find(value => value.id === event.target.value); setCustomer(item ? { id: item.id, name: item.name } : null); }}><option value="">Select customer</option>{customer && !customers.data?.items.some(item => item.id === customer.id) && <option value={customer.id}>{customer.name}</option>}{customers.data?.items.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{(customers.data?.total ?? 0) > 25 && <FinancialPagination page={customerPage} total={customers.data?.total ?? 0} size={25} onPage={setCustomerPage} />}</>}
      </section>
      <section className="space-y-2"><Field label="Sale items" required><Input aria-label="Search products" placeholder="Search products…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></Field>
        {products.isLoading ? <PageLoader variant="compact" /> : products.error ? <FinancialError error={products.error} /> : <><Select aria-label="Add product" value="" onChange={event => { const product = products.data?.items.find(item => item.id === event.target.value); if (product) setLines(current => [...current, { key: crypto.randomUUID(), product, variant: "", price: String(product.price), quantity: "1", serials: [] }]); }}><option value="">Add a product</option>{products.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{(products.data?.total ?? 0) > 25 && <FinancialPagination page={page} total={products.data?.total ?? 0} size={25} onPage={setPage} />}</>}
        {lines.map((line, index) => <div key={line.key} className="space-y-3 rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{line.product.name}</span><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}><Trash2 size={14} /></Button></div>
          {line.product.has_variants && <Select aria-label={`Variant ${index + 1}`} required value={line.variant} onChange={event => { const variant = line.product.variants?.find(item => item.id === event.target.value); update(line.key, { variant: event.target.value, serials: [], price: String(variant?.price ?? line.product.price) }); }}><option value="">Select variant</option>{line.product.variants?.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{Object.values(item.attributes).join(" / ")}</option>)}</Select>}
          {line.product.tracks_serials && <SerialPicker line={line} onChange={serials => update(line.key, { serials })} />}
          <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><Input aria-label={`Quantity ${index + 1}`} required type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value })} /></Field><Field label="Unit price (VAT included)"><Input aria-label={`Unit price ${index + 1}`} required type="number" min="0" step="0.01" value={line.price} onChange={event => update(line.key, { price: event.target.value })} /></Field></div>
        </div>)}
      </section>
      <div className="grid grid-cols-2 gap-3"><Field label="Amount paid now"><Input aria-label="Amount paid now" required type="number" min="0" step="0.01" value={paid} onChange={event => setPaid(event.target.value)} /></Field><Field label="Due date" required><Input aria-label="Due date" required type="date" value={due} onChange={event => setDue(event.target.value)} /></Field></div>
      {paidMinor !== null && paidMinor > BigInt(0) && <Field label="Payment method"><Select aria-label="Payment method" value={method} onChange={event => setMethod(event.target.value)}><option value="cash">Cash</option><option value="mobile">Mobile money</option><option value="card">Card</option></Select></Field>}
      <Field label="Notes"><Textarea aria-label="Notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)} /></Field>
      <dl className="space-y-2 rounded-lg bg-surface p-3 text-sm"><div className="flex justify-between"><dt>Sale total</dt><dd>{money(String(Number(total) / 100))}</dd></div><div className="flex justify-between font-semibold"><dt>Outstanding</dt><dd className="text-accent">{money(String(Number(outstanding) / 100))}</dd></div></dl>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={create.isPending || !customer || !lines.length}><Plus size={14} />{create.isPending ? "Saving…" : "Save receivable"}</Button></div>
    </fieldset>
  </form></DebtDrawer>;
}

function SerialPicker({ line, onChange }: { line: Line; onChange: (ids: string[]) => void }) {
  const [page, setPage] = useState(1);
  const query = useSerials(page, 25, line.product.id, "in_stock");
  return <div className="space-y-2"><p className="text-xs font-medium">Select one serial number per unit ({line.serials.length} selected)</p>{query.isLoading ? <PageLoader variant="compact" /> : query.error ? <FinancialError error={query.error} /> : <>{query.data?.items.filter(item => !line.variant || item.variant_id === line.variant).map(item => <label key={item.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={line.serials.includes(item.id)} onChange={event => onChange(event.target.checked ? [...line.serials, item.id] : line.serials.filter(id => id !== item.id))} />{item.serial_number}</label>)}{!query.data?.items.some(item => !line.variant || item.variant_id === line.variant) && <p className="text-xs text-muted">No available serial numbers for this selection.</p>}{(query.data?.total ?? 0) > 25 && <FinancialPagination page={page} total={query.data?.total ?? 0} size={25} onPage={setPage} />}</>}</div>;
}
