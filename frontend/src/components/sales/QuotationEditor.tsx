"use client";
import { useDeferredValue, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useCustomers, useCreateQuotation, useProducts, useSalesTeam, useUpdateQuotation } from "@/lib/api/hooks";
import type { ApiProduct, ApiQuotation, QuotationInput } from "@/lib/api";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { FormActions, FormErrorSummary, FormSection, FormRow } from "@/components/ui/FormKit";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

type Line = { key: string; productId: string; variantId: string; name: string; sku: string | null; price: string; quantity: string; discount: string; product: ApiProduct | null };
const blank = (key: string): Line => ({ key, productId: "", variantId: "", name: "", sku: null, price: "", quantity: "1", discount: "0", product: null });
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? 0 : Number(v));
const lineTotal = (l: Line) => Math.max(0, Math.round((num(l.price) * num(l.quantity) - num(l.discount)) * 100) / 100);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };

/** Create or edit a draft quotation. A sent quotation is frozen, so this is only ever opened for a draft. */
export function QuotationEditor({ initial, onClose, onSaved }: { initial?: ApiQuotation; onClose: () => void; onSaved: (q: ApiQuotation) => void }) {
  const { user } = useAuth();
  const { currencySymbol } = useAppConfig();
  const team = useSalesTeam();
  const [customer, setCustomer] = useState(initial?.customer_id ?? "");
  const [customerName, setCustomerName] = useState(initial?.customer?.name ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const customers = useCustomers(1, 25, useDeferredValue(customerSearch));
  const [salesperson, setSalesperson] = useState(initial?.salesperson_id ?? user?.id ?? "");
  const [issue, setIssue] = useState(initial?.issue_date ?? isoDay(new Date()));
  const [expiry, setExpiry] = useState(initial?.expiry_date ?? inDays(7));
  const [discount, setDiscount] = useState(initial ? String(initial.discount) : "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const nextKey = () => crypto.randomUUID();
  const [lines, setLines] = useState<Line[]>(() => initial?.items.length
    ? initial.items.map((i) => ({ key: nextKey(), productId: i.product_id ?? "", variantId: i.variant_id ?? "", name: i.product_name, sku: i.sku, price: String(i.unit_price), quantity: String(i.quantity), discount: String(i.discount), product: null }))
    : [blank(nextKey())]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateQuotation();
  const update = useUpdateQuotation();
  const busy = create.isPending || update.isPending;
  const { confirm, dialog } = useConfirmDialog();
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const change = (key: string, patch: Partial<Line>) => { setDirty(true); setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l))); };

  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const total = Math.max(0, subtotal - num(discount));
  const leave = () => { if (busy) return; if (dirty) confirm({ title: "Discard this quotation?", message: "Your changes have not been saved.", confirmLabel: "Discard", danger: true, onConfirm: onClose }); else onClose(); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = lines.filter((l) => l.name.trim());
    if (!filled.length) return setError("Add at least one product.");
    if (filled.some((l) => num(l.quantity) <= 0)) return setError("Every line needs a quantity above zero.");
    if (filled.some((l) => l.product?.has_variants && !l.variantId)) return setError("Choose the variant for each product that has variants.");
    if (expiry && expiry < issue) return setError("The expiry date cannot be before the issue date.");
    if (num(discount) > subtotal) return setError("The discount cannot be more than the subtotal.");
    const body: QuotationInput = {
      customer_id: customer || null, salesperson_id: salesperson || null, issue_date: issue, expiry_date: expiry || null, discount: num(discount),
      notes: notes.trim() || null, terms: terms.trim() || null,
      items: filled.map((l) => ({ product_id: l.productId || null, variant_id: l.variantId || null, product_name: l.name, sku: l.sku, unit_price: num(l.price), quantity: num(l.quantity), discount: num(l.discount) })),
    };
    try {
      const result = initial ? await update.mutateAsync({ id: initial.id, data: body }) : await create.mutateAsync(body);
      setDirty(false);
      onSaved(result.data);
    } catch (cause) { setError((cause as { detail?: string; message?: string })?.detail ?? (cause as Error)?.message ?? "The quotation could not be saved."); }
  }

  return (
    <Drawer open title={initial ? `Edit ${initial.quote_number}` : "New quotation"} description="An offer to a customer. It takes no payment and holds no stock until it is accepted and converted into a sale." size="xl" onClose={leave} dirty={dirty}>
      {dialog}
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <FormErrorSummary errors={error} />
        <fieldset disabled={busy} className="space-y-4">
          <FormSection title="Quotation details" variant="plain">
            <Field label="Customer" hint="Leave empty for a walk-in quote.">
              <SearchSelect label="Customer" value={customer} selectedLabel={customerName || customers.data?.items.find((c) => c.id === customer)?.name} query={customerSearch} onQueryChange={setCustomerSearch}
                loading={customers.isFetching} items={(customers.data?.items ?? []).map((c) => ({ id: c.id, label: c.name, hint: c.phone ?? undefined }))}
                onSelect={(id) => { setCustomer(id); setCustomerName(customers.data?.items.find((c) => c.id === id)?.name ?? ""); setDirty(true); }} placeholder="Search customers…" />
            </Field>
            <Field label="Salesperson" required>
              <Select value={salesperson} onChange={(e) => touch(setSalesperson)(e.target.value)} required>
                {!team.data?.some((m) => m.id === salesperson) && salesperson && <option value={salesperson}>{initial?.salesperson_name ?? "Me"}</option>}
                {(team.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label="Issue date" required><Input type="date" required value={issue} onChange={(e) => touch(setIssue)(e.target.value)} /></Field>
            <Field label="Valid until" hint="Shown on the quotation. After this date it can no longer be accepted."><Input type="date" min={issue} value={expiry} onChange={(e) => touch(setExpiry)(e.target.value)} /></Field>
          </FormSection>

          <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Products">
            <div className="flex items-center justify-between"><h2 className="pesaa-card-title">Products</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => { setDirty(true); setLines((all) => [...all, blank(nextKey())]); }}><Plus size={14} aria-hidden /> Add line</Button></div>
            {lines.map((l, i) => <LineRow key={l.key} line={l} index={i} onChange={(p) => change(l.key, p)} onRemove={lines.length > 1 ? () => { setDirty(true); setLines((all) => all.filter((x) => x.key !== l.key)); } : undefined} symbol={currencySymbol} />)}
            <p className="text-xs text-muted">Prices include VAT. The VAT portion is worked out from the total when the quotation is saved.</p>
          </section>

          <FormSection title="Notes and terms" variant="plain" columns={1}>
            <FormRow><Field label="Remarks" hint="Printed on the quotation."><Textarea rows={2} maxLength={2000} value={notes} onChange={(e) => touch(setNotes)(e.target.value)} /></Field></FormRow>
            <FormRow><Field label="Terms and bank details" hint="Starts from your company's standing terms. Edit it for this quotation if needed."><Textarea rows={4} maxLength={2000} value={terms} onChange={(e) => touch(setTerms)(e.target.value)} /></Field></FormRow>
          </FormSection>

          <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{fmtMoney(subtotal, currencySymbol)}</span></div>
            <div className="flex items-center justify-between gap-3"><label htmlFor="q-discount" className="text-muted">Discount</label><Input id="q-discount" inputMode="decimal" className="h-8 w-32 text-right tabular-nums" value={discount} onChange={(e) => touch(setDiscount)(e.target.value)} /></div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{fmtMoney(total, currencySymbol)}</span></div>
          </div>
        </fieldset>
        <FormActions onCancel={leave} busy={busy} submitLabel={initial ? "Save changes" : "Save as draft"} sticky />
      </form>
    </Drawer>
  );
}

function LineRow({ line, index, onChange, onRemove, symbol }: { line: Line; index: number; onChange: (p: Partial<Line>) => void; onRemove?: () => void; symbol: string }) {
  const [search, setSearch] = useState("");
  const products = useProducts(1, 25, useDeferredValue(search), true);
  const variants = line.product?.variants?.filter((v) => v.is_active) ?? [];
  function pick(id: string) {
    const p = products.data?.items.find((x) => x.id === id);
    if (p) onChange({ product: p, productId: p.id, variantId: "", name: p.name, sku: p.sku, price: String(p.price) });
  }
  function pickVariant(id: string) {
    const v = variants.find((x) => x.id === id);
    if (v && line.product) onChange({ variantId: v.id, sku: v.sku ?? line.sku, price: String(v.price), name: `${line.product.name} · ${Object.values(v.attributes).join(" / ")}` });
  }
  const small = "mb-1 block text-[11px] font-medium text-muted";
  return (
    // The line follows the width of its own container: a narrow drawer stacks the fields in pairs, a wide page puts them in a row.
    <div className="@container space-y-2 rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <SearchSelect label={`Product ${index + 1}`} value={line.productId} selectedLabel={line.name} query={search} onQueryChange={setSearch} loading={products.isFetching}
            items={(products.data?.items ?? []).map((p) => ({ id: p.id, label: p.name, hint: p.sku ?? undefined }))} onSelect={pick} placeholder="Search name, SKU or barcode…"
            footer={(products.data?.total ?? 0) > 25 ? <span className="text-muted">Showing the first 25. Keep typing to narrow the list.</span> : undefined} />
        </div>
        {onRemove && <Button type="button" size="sm" variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={onRemove}><Trash2 size={14} /></Button>}
      </div>
      {line.product?.has_variants && (
        <Select aria-label={`Variant ${index + 1}`} required value={line.variantId} onChange={(e) => pickVariant(e.target.value)}>
          <option value="">Choose a variant</option>{variants.map((v) => <option key={v.id} value={v.id}>{Object.values(v.attributes).join(" / ") || v.sku}</option>)}
        </Select>
      )}
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        <label><span className={small}>Quantity</span><Input aria-label={`Quantity ${index + 1}`} inputMode="decimal" className="text-right tabular-nums" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} /></label>
        <label><span className={small}>Unit price</span><Input aria-label={`Unit price ${index + 1}`} inputMode="decimal" className="text-right tabular-nums" value={line.price} onChange={(e) => onChange({ price: e.target.value })} /></label>
        <label><span className={small}>Discount</span><Input aria-label={`Discount ${index + 1}`} inputMode="decimal" className="text-right tabular-nums" value={line.discount} onChange={(e) => onChange({ discount: e.target.value })} /></label>
        <div><span className={small}>Line total</span><p className="flex h-9 items-center justify-end whitespace-nowrap text-sm font-semibold tabular-nums">{fmtMoney(lineTotal(line), symbol)}</p></div>
      </div>
    </div>
  );
}
