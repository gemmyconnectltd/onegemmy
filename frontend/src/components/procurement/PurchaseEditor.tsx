"use client";

import { useDeferredValue, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { formatMoney } from "@/lib/money";
import { purchaseLineMinor, scaled } from "@/lib/purchaseAmounts";
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useProducts, useProduct, useSuppliers } from "@/lib/api/hooks";
import type { ApiProduct, PurchaseOrder } from "@/lib/api";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { Pagination } from "@/components/ui/Pagination";

type Row = { id: string; product: ApiProduct | null; productId: string; name: string; sku: string | null; variantId: string; cost: string; quantity: string; updateCost: boolean; updatePrice: boolean; sellingPrice: string };
const newRow = (id: string): Row => ({id, product: null, productId: "", name: "", sku: null, variantId: "", cost: "", quantity: "1", updateCost: false, updatePrice: false, sellingPrice: ""});

export function PurchaseEditor({ initial, onClose, onSaved }: { initial?: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const { currency } = useAppConfig();
  const { hasPermission } = useAuth();
  const canPrice = hasPermission("pricing:update");
  const money = (value: string | number, code = currency) => formatMoney(Number(value), code, {showCode: true});
  const [supplier, setSupplier] = useState(initial?.supplier_id || "");
  const [supplierSearch, setSupplierSearch] = useState("");
  const suppliers = useSuppliers(1, 25, useDeferredValue(supplierSearch));
  const [expected, setExpected] = useState(initial?.expected_date || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [rows, setRows] = useState<Row[]>(() => initial ? initial.items.map(item => ({id: item.id, product: null, productId: item.product_id || "", name: item.product_name, sku: item.sku, variantId: item.variant_id || "", cost: String(item.unit_cost), quantity: String(item.quantity), updateCost: !!item.update_catalog_cost, updatePrice: item.selling_price != null, sellingPrice: item.selling_price != null ? String(item.selling_price) : ""})) : [newRow("first")]);
  const create = useCreatePurchaseOrder(), update = useUpdatePurchaseOrder();
  const busy = create.isPending || update.isPending;
  const submitting = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const subtotal = rows.reduce((sum, row) => sum + (purchaseLineMinor(row.cost, row.quantity) ?? BigInt(0)), BigInt(0));
  function change(id: string, patch: Partial<Row>) { setRows(previous => previous.map(row => row.id === id ? {...row, ...patch} : row)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    for (const row of rows) {
      if (!row.productId || !row.name || purchaseLineMinor(row.cost, row.quantity) === null || (row.product?.has_variants && !row.variantId) || (row.updatePrice && scaled(row.sellingPrice, 2) === null)) { setError({detail: "Choose a product (and variant when needed), a positive quantity and valid prices for every item."}); return; }
    }
    submitting.current = true;
    try {
      const data = {supplier_id: supplier || null, expected_date: expected || null, notes: notes.trim() || null, status: "Draft", items: rows.map(row => ({product_id: row.productId, variant_id: row.variantId || null, product_name: row.name, sku: row.sku, unit_cost: Number(row.cost), quantity: Number(row.quantity), update_catalog_cost: row.updateCost, selling_price: row.updatePrice ? row.sellingPrice : null}))};
      if (initial) await update.mutateAsync({id: initial.id, data}); else await create.mutateAsync(data);
      onSaved();
    } catch (cause) { setError(cause); } finally { submitting.current = false; }
  }
  return <Drawer open title={initial ? "Edit Purchase" : "New Purchase"} description={initial?.reference || "Choose products and agree costs with your supplier."} size="xl" onClose={() => {if (!busy) onClose();}}>
    <form onSubmit={submit} className="space-y-5 p-5"><fieldset disabled={busy} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Supplier<Input aria-label="Find purchase supplier" value={supplierSearch} onChange={event => setSupplierSearch(event.target.value)} placeholder="Search suppliers…" /><Select aria-label="Purchase supplier" value={supplier} onChange={event => setSupplier(event.target.value)}><option value="">No supplier selected</option>{supplier && !suppliers.data?.items.some(item => item.id === supplier) && <option value={supplier}>{initial?.supplier?.name || "Selected supplier"}</option>}{suppliers.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><FinancialError error={suppliers.error} /></label><label className="text-xs font-medium">Expected date<Input aria-label="Expected date" type="date" value={expected} onChange={event => setExpected(event.target.value)} /></label></div>
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Purchase items</h2><Button variant="ghost" size="sm" onClick={() => setRows(previous => [...previous, newRow(crypto.randomUUID())])}><Plus size={14} />Add item</Button></div>
      <div className="space-y-3">{rows.map((row, index) => <PurchaseRow key={row.id} row={row} index={index} currency={initial?.currency_code || currency} catalogCurrency={currency} money={money} canPrice={canPrice} onChange={patch => change(row.id, patch)} onRemove={rows.length > 1 ? () => setRows(previous => previous.filter(item => item.id !== row.id)) : undefined} />)}</div>
      <p className="text-[11px] leading-relaxed text-muted">Unit cost applies to this purchase. Checked catalog cost and selling-price changes take effect when goods are received and apply across your branches. Existing completed purchases keep their original prices.</p>
      <label className="block text-xs font-medium">Notes<Textarea aria-label="Purchase notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Supplier terms or reason for price changes…" /></label>
      <div className="flex justify-between rounded-lg bg-surface p-3 text-sm font-semibold"><span>Items subtotal</span><span className="tabular-nums">{money(Number(subtotal) / 100, initial?.currency_code || currency)}</span></div>{initial && (initial.discount > 0 || initial.tax > 0) && <p className="text-[11px] text-muted">Existing purchase discount and tax are retained; the server recalculates the final total.</p>}
    </fieldset><FinancialError error={error} /><div className="sticky -bottom-5 flex justify-end gap-2 border-t border-border bg-card py-4"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : initial ? "Save Purchase" : "Save Draft Purchase"}</Button></div></form>
  </Drawer>;
}

function PurchaseRow({row, index, currency, catalogCurrency, money, canPrice, onChange, onRemove}: {row: Row; index: number; currency: string; catalogCurrency: string; money: (value: string | number, code?: string) => string; canPrice: boolean; onChange: (patch: Partial<Row>) => void; onRemove?: () => void}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const products = useProducts(page, 25, useDeferredValue(search), true);
  const selected = useProduct(row.productId || undefined, {enabled: !row.product && !!row.productId});
  const product = row.product || selected.data;
  const variant = product?.variants.find(item => item.id === row.variantId);
  const catalogCost = variant?.cost ?? product?.cost;
  const catalogPrice = variant?.price ?? product?.price;
  const total = purchaseLineMinor(row.cost, row.quantity);
  const delta = currency === catalogCurrency && catalogCost != null && scaled(row.cost, 2) !== null ? scaled(row.cost, 2)! - (purchaseLineMinor(String(catalogCost), String(product?.conversion_factor || 1)) ?? BigInt(0)) : null;
  function pick(id: string) {
    const value = products.data?.items.find(item => item.id === id);
    if (value) onChange({product: value, productId: value.id, name: value.name, sku: value.sku, variantId: "", cost: currency === catalogCurrency ? (Number(purchaseLineMinor(String(value.cost), String(value.conversion_factor || 1)) || BigInt(0)) / 100).toFixed(2) : "", sellingPrice: String(value.price)});
  }
  return <section className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Item {index + 1}</h3>{onRemove && <Button size="sm" variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={onRemove}><Trash2 size={14} /></Button>}</div>
    <label className="block text-[11px] font-medium">Product<Input aria-label={`Find product ${index + 1}`} placeholder="Search name or SKU…" value={search} onChange={event => {setSearch(event.target.value); setPage(1);}} /><Select aria-label={`Product ${index + 1}`} value={row.productId} onChange={event => pick(event.target.value)} required><option value="">Select product</option>{row.productId && !products.data?.items.some(item => item.id === row.productId) && <option value={row.productId}>{row.name}</option>}{products.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}</Select></label>
    {products.isLoading && <PageLoader variant="compact" />}<FinancialError error={products.error || selected.error} />{(products.data?.total || 0) > 25 && <Pagination page={page} pageSize={25} total={products.data!.total} onPageChange={setPage} itemLabel="products" />}
    {product?.has_variants && <label className="block text-[11px] font-medium">Variant<Select required aria-label={`Variant ${index + 1}`} value={row.variantId} onChange={event => {const value = product.variants.find(item => item.id === event.target.value); if(value) onChange({variantId: value.id, sku: value.sku, cost: currency === catalogCurrency ? (Number(purchaseLineMinor(String(value.cost), String(product.conversion_factor || 1)) || BigInt(0)) / 100).toFixed(2) : "", sellingPrice: String(value.price)});}}><option value="">Choose variant</option>{product.variants.filter(item => item.is_active || item.id === row.variantId).map(item => <option key={item.id} value={item.id}>{Object.values(item.attributes).join(" / ")}{item.sku ? ` · ${item.sku}` : ""}</option>)}</Select></label>}
    <div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-medium">Quantity<Input aria-label={`Quantity ${index + 1}`} inputMode="decimal" required value={row.quantity} onChange={event => onChange({quantity: event.target.value})} /></label><label className="text-[11px] font-medium">Unit cost ({currency})<Input aria-label={`Unit cost ${index + 1}`} inputMode="decimal" required value={row.cost} onChange={event => onChange({cost: event.target.value})} placeholder="0.00" /></label></div>
    {catalogCost != null && <div className="flex flex-wrap justify-between gap-1 text-[11px]"><span className="text-muted">Catalog cost / stock unit: {money(catalogCost, catalogCurrency)}</span>{delta !== null && delta !== BigInt(0) && <span className={delta > BigInt(0) ? "text-amber-600" : "text-accent"}>{delta > BigInt(0) ? "+" : "−"}{money(Number(delta < BigInt(0) ? -delta : delta) / 100)} per unit</span>}</div>}
    {canPrice ? <div className="space-y-3 border-t border-border pt-3"><label className="flex items-start gap-2 text-[11px]"><input type="checkbox" checked={row.updateCost} onChange={event => onChange({updateCost: event.target.checked})} />Update catalog cost when received</label><label className="flex items-start gap-2 text-[11px]"><input type="checkbox" checked={row.updatePrice} onChange={event => onChange({updatePrice: event.target.checked, sellingPrice: row.sellingPrice || String(catalogPrice ?? "")})} />Change selling price when received</label>{row.updatePrice && <label className="block text-[11px] font-medium">New selling price ({catalogCurrency})<Input aria-label={`Selling price ${index + 1}`} inputMode="decimal" required value={row.sellingPrice} onChange={event => onChange({sellingPrice: event.target.value})} /><span className="mt-1 block text-muted">Current: {catalogPrice == null ? "—" : money(catalogPrice, catalogCurrency)}</span></label>}</div> : <p className="text-[11px] text-muted">Pricing update permission is required to change catalog prices.</p>}
    <div className="flex justify-between border-t border-border pt-2 text-xs"><span className="text-muted">Line total</span><span className="font-semibold tabular-nums">{total === null ? "—" : money(Number(total) / 100, currency)}</span></div>
  </section>;
}
