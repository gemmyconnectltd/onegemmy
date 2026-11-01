"use client";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { formatMoney } from "@/lib/money";
import { purchaseLineMinor, scaled } from "@/lib/purchaseAmounts";
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useAttachPurchaseFile, useProducts, useProduct, useSuppliers } from "@/lib/api/hooks";
import type { ApiProduct, PurchaseOrder } from "@/lib/api";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { PageLoader } from "@/components/ui/PageLoader";
import { AccountPicker, FinancialError } from "@/components/accounting/FinancialShared";
import { Pagination } from "@/components/ui/Pagination";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

type Row = { isService: boolean; expenseAccount: string; taxRate: 0 | 18; id: string; product: ApiProduct | null; productId: string; name: string; sku: string | null; variantId: string; cost: string; quantity: string; updateCost: boolean; updatePrice: boolean; sellingPrice: string };
const newRow = (id: string): Row => ({isService: false, expenseAccount: "", taxRate: 18, id, product: null, productId: "", name: "", sku: null, variantId: "", cost: "", quantity: "1", updateCost: false, updatePrice: false, sellingPrice: ""});

export function PurchaseEditor({ initial, onClose, onSaved, page = false }: { initial?: PurchaseOrder; onClose: () => void; onSaved: (purchase: PurchaseOrder) => void; page?: boolean }) {
  const { currency, vatEnabled } = useAppConfig();
  const { hasPermission, activeBranchId, user } = useAuth();
  const canPrice = hasPermission("pricing:update");
  const code = initial?.currency_code || currency;
  const money = (value: string | number, ccy = code) => formatMoney(Number(value), ccy, {showCode: true});
  const [supplier, setSupplier] = useState(initial?.supplier_id || "");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const suppliers = useSuppliers(supplierPage, 25, useDeferredValue(supplierSearch));
  const [expected, setExpected] = useState(initial?.expected_date || "");
  const [orderDate, setOrderDate] = useState(initial?.order_date || initial?.created_at?.slice(0, 10) || "");
  const [terms, setTerms] = useState(initial?.payment_terms_days == null ? "" : String(initial.payment_terms_days));
  const [supplierRef, setSupplierRef] = useState(initial?.supplier_reference || "");
  const [instructions, setInstructions] = useState(initial?.delivery_instructions || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [dirty, setDirty] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => initial ? initial.items.map(item => ({isService: !!item.is_service, expenseAccount: item.expense_account_id || "", taxRate: Number(item.tax_rate ?? 18) === 0 ? 0 : 18, id: item.id, product: null, productId: item.product_id || "", name: item.product_name, sku: item.sku, variantId: item.variant_id || "", cost: String(item.unit_cost), quantity: String(item.quantity), updateCost: !!item.update_catalog_cost, updatePrice: item.selling_price != null, sellingPrice: item.selling_price != null ? String(item.selling_price) : ""})) : [newRow("first")]);
  const create = useCreatePurchaseOrder(), update = useUpdatePurchaseOrder();
  const attach = useAttachPurchaseFile();
  const [files, setFiles] = useState<File[]>([]);
  const [savingFiles, setSavingFiles] = useState(false);
  const busy = create.isPending || update.isPending || savingFiles;
  const submitting = useRef(false);
  const clientReference = useRef("");
  const [error, setError] = useState<unknown>(null);
  const { confirm, dialog } = useConfirmDialog();
  const subtotal = rows.reduce((sum, row) => sum + (purchaseLineMinor(row.cost, row.quantity) ?? BigInt(0)), BigInt(0));
  const total = subtotal - (scaled(String(initial?.discount || 0), 2) || BigInt(0)) + (scaled(String(initial?.tax || 0), 2) || BigInt(0));
  useEffect(() => { if (!initial) queueMicrotask(() => { const today = new Date(); setOrderDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`); }); }, [initial]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = "";}; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const taxable = rows.reduce((sum, row) => sum + (vatEnabled && row.taxRate === 18 ? purchaseLineMinor(row.cost, row.quantity) || BigInt(0) : BigInt(0)), BigInt(0));
  const discountMinor = scaled(String(initial?.discount || 0), 2) || BigInt(0);
  const denominator = subtotal * BigInt(118);
  const numerator = taxable * (subtotal - discountMinor) * BigInt(18);
  const includedVat = denominator > BigInt(0) ? (numerator + denominator / BigInt(2)) / denominator : BigInt(0);
  function change(id: string, patch: Partial<Row>) { setDirty(true); setRows(previous => previous.map(row => row.id === id ? {...row, ...patch} : row)); }
  function leave() { if (busy) return; if (dirty) confirm({title: "Discard unsaved purchase?", message: "Your changes have not been saved.", confirmLabel: "Discard changes", danger: true, onConfirm: onClose}); else onClose(); }
  async function submit(status: "Draft" | "PendingApproval") {
    if (submitting.current) return;
    setError(null);
    if (!orderDate || (expected && expected < orderDate) || (status !== "Draft" && !supplier)) {setError({detail: "Enter a valid order date, delivery date and supplier before submitting."}); return;}
    for (const row of rows) {
      if ((row.isService ? !row.expenseAccount : !row.productId) || !row.name || purchaseLineMinor(row.cost, row.quantity) === null || (row.product?.has_variants && !row.variantId) || (row.updatePrice && scaled(row.sellingPrice, 2) === null)) {setError({detail: "Choose a product and variant, positive quantity and valid prices for every item."}); return;}
    }
    submitting.current = true;
    if (!clientReference.current) clientReference.current = crypto.randomUUID();
    try {
      const data = {supplier_id: supplier || null, branch_id: initial?.branch_id || activeBranchId || null, order_date: orderDate, payment_terms_days: terms === "" ? null : Number(terms), supplier_reference: supplierRef.trim() || null, delivery_instructions: instructions.trim() || null, expected_date: expected || null, notes: notes.trim() || null, status, client_reference: clientReference.current, currency_code: code, items: rows.map(row => ({is_service: row.isService, expense_account_id: row.isService ? row.expenseAccount : null, tax_rate: vatEnabled ? row.taxRate : 0 as 0 | 18, product_id: row.productId || null, variant_id: row.variantId || null, product_name: row.name, sku: row.sku, unit_cost: row.cost, quantity: row.quantity, update_catalog_cost: row.updateCost, selling_price: row.updatePrice ? row.sellingPrice : null}))};
      const result = initial ? await update.mutateAsync({id: initial.id, data}) : await create.mutateAsync(data);
      setSavingFiles(true);
      for (const file of files) await attach.mutateAsync({id: result.data.id, file});
      setFiles([]); setSavingFiles(false);
      setDirty(false); onSaved(result.data);
    } catch (cause) {setError(cause);} finally {submitting.current = false; setSavingFiles(false);}
  }
  const content = <form onSubmit={event => {event.preventDefault(); void submit("Draft");}} onChange={() => setDirty(true)} className="space-y-5">
    {dialog}
    {page && <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="pesaa-page-title">{initial ? `Edit ${initial.reference}` : "New Purchase Order"}</h1><p className="mt-1 text-sm text-muted">Create a purchase order to restock inventory or buy services.</p></div><Button variant="outline" onClick={leave}>Back to Purchases</Button></header>}
    <fieldset disabled={busy} className="grid min-w-0 gap-5 xl:grid-cols-3">
      <div className="min-w-0 space-y-5 xl:col-span-2">
        <section className="space-y-4 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Purchase information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Field label="Find supplier"><Input value={supplierSearch} onChange={event => {setSupplierSearch(event.target.value); setSupplierPage(1);}} placeholder="Search suppliers…" /></Field><Field label="Supplier"><Select value={supplier} onChange={event => setSupplier(event.target.value)}><option value="">Select supplier</option>{supplier && !suppliers.data?.items.some(item => item.id === supplier) && <option value={supplier}>{initial?.supplier?.name || "Selected supplier"}</option>}{suppliers.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Pagination page={supplierPage} pageSize={25} total={suppliers.data?.total || 0} onPageChange={setSupplierPage} itemLabel="suppliers" /><FinancialError error={suppliers.error} /><Link className="text-xs text-accent hover:underline" href="/procurement/suppliers" target="_blank" rel="noopener noreferrer">Add or view supplier ↗</Link></div>
            <div className="space-y-4"><Field label="Order date" required><Input type="date" required value={orderDate} onChange={event => setOrderDate(event.target.value)} /></Field><Field label="Expected delivery"><Input type="date" min={orderDate || undefined} value={expected} onChange={event => setExpected(event.target.value)} /></Field></div>
            <Field label="Purchase order number"><Input readOnly value={initial?.reference || "Assigned securely when saved"} /></Field>
            <Field label="Receiving branch" hint="Use the branch selector in the top bar to change your authorized working branch. Inventory balances are held across the business."><Input readOnly value={initial?.branch_id || activeBranchId || user?.branchName || "Main branch (assigned by server)"} /></Field>
            <Field label="Payment terms"><Select value={terms} onChange={event => setTerms(event.target.value)}><option value="">Not specified</option><option value="0">Due on receipt</option><option value="7">Net 7</option><option value="15">Net 15</option><option value="30">Net 30</option>{terms && !["0", "7", "15", "30"].includes(terms) && <option value={terms}>Net {terms}</option>}</Select></Field>
            <Field label="Supplier reference"><Input maxLength={100} value={supplierRef} onChange={event => setSupplierRef(event.target.value)} /></Field>
          </div>
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-card"><div className="flex items-center justify-between p-4"><h2 className="pesaa-card-title">Purchase items</h2><Button variant="outline" size="sm" disabled={rows.length >= 200} onClick={() => {setDirty(true); setRows(previous => [...previous, newRow(crypto.randomUUID())]);}}><Plus size={14} />Add item</Button></div>
          <TableScroll><table className="w-full min-w-[800px] text-left text-sm"><thead><tr><th className="p-4">Product / variant</th><th className="p-4">SKU</th><th className="p-4">Quantity</th><th className="p-4">Unit cost</th><th className="p-4">Tax</th><th className="p-4 text-right">Line total</th><th className="p-4"><span className="sr-only">Remove</span></th></tr></thead><tbody className="divide-y divide-border">{rows.map((row, index) => <PurchaseRow key={row.id} row={row} index={index} currency={code} catalogCurrency={currency} money={money} canPrice={canPrice} vatEnabled={vatEnabled} onChange={patch => change(row.id, patch)} onRemove={rows.length > 1 ? () => {setDirty(true); setRows(previous => previous.filter(item => item.id !== row.id));} : undefined} />)}</tbody></table></TableScroll>
          <p className="p-4 text-xs text-muted">Costs are VAT-inclusive. Catalog price changes apply only when received. Service lines post to their selected expense account and never increase stock.</p>
        </section>
        <section className="space-y-4 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Notes and attachments</h2><Field label="Purchase notes"><Textarea rows={3} maxLength={5000} value={notes} onChange={event => setNotes(event.target.value)} /></Field><Field label="Delivery instructions"><Textarea rows={2} maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)} /></Field><Field label="Attachments" hint="PDF, PNG or JPEG. Up to ten files, 5 MB each. Files upload after the order is saved."><Input type="file" accept="application/pdf,image/png,image/jpeg" multiple onChange={event => {const selected = Array.from(event.target.files || []); if (selected.length > 10 || selected.some(file => file.size > 5 * 1024 * 1024)) {setError({detail: "Choose up to ten files, no larger than 5 MB each."}); event.target.value = ""; setFiles([]);} else setFiles(selected);}} /></Field></section>
      </div>
      <aside className="h-fit space-y-4 rounded-xl border border-border bg-card p-4 xl:sticky xl:top-4"><h2 className="pesaa-card-title">Order summary</h2><div className="flex justify-between text-sm"><span>Items subtotal (inclusive)</span><span>{money(Number(subtotal) / 100)}</span></div>{!!initial?.discount && <div className="flex justify-between text-sm"><span>Discount</span><span>{money(initial.discount)}</span></div>}{!!initial?.tax && <div className="flex justify-between text-sm"><span>Existing additional tax</span><span>{money(initial.tax)}</span></div>}<div className="flex justify-between text-sm"><span>Net of included VAT</span><span>{money(Number(subtotal - discountMinor - includedVat) / 100)}</span></div><div className="flex justify-between text-sm"><span>Included VAT</span><span>{money(Number(includedVat) / 100)}</span></div><div className="flex justify-between border-t border-border pt-3 font-semibold"><span>Grand total</span><span>{money(Number(total) / 100)}</span></div><p className="text-xs text-muted">Currency: {code}. A purchase order reserves no stock and records no payment. Bills are posted when deliveries are confirmed.</p><Button type="submit" variant="outline" className="w-full" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Save as Draft"}</Button>{!initial && <Button className="w-full" disabled={busy} onClick={() => void submit("PendingApproval")}>Create Purchase Order</Button>}<Button variant="ghost" className="w-full" onClick={leave}>Cancel</Button><FinancialError error={error} /></aside>
    </fieldset>
  </form>;
  return page ? content : <Drawer open title={initial ? "Edit Purchase" : "New Purchase"} size="xl" onClose={leave}><div className="p-5">{content}</div></Drawer>;
}

function PurchaseRow({row, index, currency, catalogCurrency, money, canPrice, vatEnabled, onChange, onRemove}: {row: Row; index: number; currency: string; catalogCurrency: string; money: (value: string | number, code?: string) => string; canPrice: boolean; vatEnabled: boolean; onChange: (patch: Partial<Row>) => void; onRemove?: () => void}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const products = useProducts(page, 25, useDeferredValue(search), true);
  const selected = useProduct(row.productId || undefined, {enabled: !row.product && !!row.productId});
  const product = row.product || selected.data;
  const variant = product?.variants.find(item => item.id === row.variantId);
  const catalogCost = variant?.cost ?? product?.cost;
  const catalogPrice = variant?.price ?? product?.price;
  const total = purchaseLineMinor(row.cost, row.quantity);
  function pick(id: string) {
    const value = products.data?.items.find(item => item.id === id);
    if (value) onChange({product: value, productId: value.id, name: value.name, sku: value.sku, variantId: "", cost: currency === catalogCurrency ? (Number(purchaseLineMinor(String(value.cost), String(value.conversion_factor || 1)) || BigInt(0)) / 100).toFixed(2) : "", sellingPrice: String(value.price)});
  }
  return <tr className="align-top">
    <td className="min-w-64 space-y-2 p-4">
      <Select aria-label={`Item type ${index + 1}`} value={row.isService ? "service" : "product"} onChange={event => onChange({isService: event.target.value === "service", product: null, productId: "", variantId: "", name: "", sku: null, updateCost: false, updatePrice: false})}><option value="product">Inventory product</option><option value="service">Service</option></Select>
      {row.isService ? <><Input aria-label={`Service description ${index + 1}`} required maxLength={255} placeholder="Describe service…" value={row.name} onChange={event => onChange({name: event.target.value})} /><AccountPicker label={`Expense account ${index + 1}`} type="Expense" optional={false} required value={row.expenseAccount} onChange={value => onChange({expenseAccount: value})} /></> : <>
      <Input aria-label={`Find product ${index + 1}`} placeholder="Name, SKU or barcode…" value={search} onChange={event => {setSearch(event.target.value); setPage(1);}} />
      <Select aria-label={`Product ${index + 1}`} value={row.productId} onChange={event => pick(event.target.value)} required><option value="">Select product</option>{row.productId && !products.data?.items.some(item => item.id === row.productId) && <option value={row.productId}>{row.name}</option>}{products.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}</Select>
      {product?.has_variants && <Select required aria-label={`Variant ${index + 1}`} value={row.variantId} onChange={event => {const value = product.variants.find(item => item.id === event.target.value); if(value) onChange({variantId: value.id, sku: value.sku, cost: currency === catalogCurrency ? (Number(purchaseLineMinor(String(value.cost), String(product.conversion_factor || 1)) || BigInt(0)) / 100).toFixed(2) : "", sellingPrice: String(value.price)});}}><option value="">Choose variant</option>{product.variants.filter(item => item.is_active || item.id === row.variantId).map(item => <option key={item.id} value={item.id}>{Object.values(item.attributes).join(" / ")}</option>)}</Select>}
      {products.isLoading && <PageLoader variant="compact" />}<FinancialError error={products.error || selected.error} />
      {(products.data?.total || 0) > 25 && <Pagination page={page} pageSize={25} total={products.data!.total} onPageChange={setPage} itemLabel="products" />}
      {canPrice && <details className="text-xs"><summary className="cursor-pointer text-accent">Catalog price options</summary><div className="space-y-2 py-2"><p className="text-muted">Current cost: {catalogCost == null ? "—" : money(catalogCost, catalogCurrency)}. Price: {catalogPrice == null ? "—" : money(catalogPrice, catalogCurrency)}.</p><label className="flex gap-2"><input type="checkbox" checked={row.updateCost} onChange={event => onChange({updateCost: event.target.checked})} />Update catalog cost on receipt</label><label className="flex gap-2"><input type="checkbox" checked={row.updatePrice} onChange={event => onChange({updatePrice: event.target.checked, sellingPrice: row.sellingPrice || String(catalogPrice ?? "")})} />Update selling price on receipt</label>{row.updatePrice && <Input aria-label={`Selling price ${index + 1}`} value={row.sellingPrice} onChange={event => onChange({sellingPrice: event.target.value})} />}</div></details>}
      </>}
    </td>
    <td className="p-4 text-xs text-muted">{row.sku || "—"}</td>
    <td className="min-w-28 p-4"><Input aria-label={`Quantity ${index + 1}`} inputMode="decimal" required value={row.quantity} onChange={event => onChange({quantity: event.target.value})} /></td>
    <td className="min-w-32 p-4"><Input aria-label={`Unit cost ${index + 1}`} inputMode="decimal" required value={row.cost} onChange={event => onChange({cost: event.target.value})} /></td>
    <td className="min-w-36 p-4"><Select aria-label={`Tax ${index + 1}`} disabled={!vatEnabled} value={vatEnabled ? row.taxRate : 0} onChange={event => onChange({taxRate: Number(event.target.value) as 0 | 18})}><option value={18}>VAT 18% included</option><option value={0}>Exempt / no VAT</option></Select></td>
    <td className="whitespace-nowrap p-4 text-right font-semibold tabular-nums">{total === null ? "—" : money(Number(total) / 100, currency)}</td>
    <td className="p-4">{onRemove && <Button size="sm" variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={onRemove}><Trash2 size={14} /></Button>}</td>
  </tr>;
}
