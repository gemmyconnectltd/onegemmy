"use client";
import { useDeferredValue, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { warehousesApi } from "@/lib/api";
import { useProducts, useSubmitCount, useWarehouses } from "@/lib/api/hooks";
import { fetchEvery } from "@/lib/exportTable";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select } from "@/components/ui/Form";
import { FormActions, FormErrorSummary } from "@/components/ui/FormKit";
import { SearchSelect } from "@/components/ui/SearchSelect";

type Line = { key: string; productId: string; variantId: string | null; name: string; counted: string };
const fail = (cause: unknown) => (cause as { detail?: string })?.detail ?? (cause as Error)?.message ?? "That didn't work. Please try again.";

/** Record what was physically counted. Nothing changes in stock until someone with authority approves the differences. */
export function NewCountDrawer({ onClose }: { onClose: () => void }) {
  const warehouses = useWarehouses().data?.items.filter((w) => w.is_active) ?? [];
  const submit = useSubmitCount();
  const [warehouse, setWarehouse] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (key: string, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function loadAll() {
    if (!warehouse) return setError("Choose the warehouse first.");
    setLoading(true); setError(null);
    try {
      const rows = await fetchEvery((p, s) => warehousesApi.stock(p, { warehouse_id: warehouse }, s), 500);
      setLines(rows.map((r) => ({ key: crypto.randomUUID(), productId: r.product_id, variantId: r.variant_id, name: r.name, counted: String(r.on_hand) })));
    } catch (cause) { setError(fail(cause)); } finally { setLoading(false); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = lines.filter((l) => l.productId);
    if (!warehouse) return setError("Choose the warehouse you counted.");
    if (!filled.length) return setError("Count at least one product.");
    if (filled.some((l) => l.counted.trim() === "" || !(Number(l.counted) >= 0))) return setError("Every counted quantity must be zero or more.");
    try { await submit.mutateAsync({ warehouse_id: warehouse, note: note.trim() || null, lines: filled.map((l) => ({ product_id: l.productId, variant_id: l.variantId, counted_quantity: Number(l.counted) })) }); onClose(); }
    catch (cause) { setError(fail(cause)); }
  }
  return (
    <Drawer open onClose={() => !submit.isPending && onClose()} size="xl" title="New stock count" description="Count what is on the shelves. The differences from the books wait for approval.">
      <form onSubmit={send} className="space-y-4 p-4 sm:p-5">
        <FormErrorSummary errors={error} />
        <fieldset disabled={submit.isPending} className="space-y-3">
          <div className="grid gap-3 @md:grid-cols-2 sm:grid-cols-2">
            <Field label="Warehouse" required><Select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setLines([]); }}><option value="">Choose…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
            <Field label="Note"><Input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Monthly count, aisle 3…" /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!warehouse || loading} onClick={() => void loadAll()}>{loading ? "Loading…" : "Load everything this warehouse holds"}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((all) => [...all, { key: crypto.randomUUID(), productId: "", variantId: null, name: "", counted: "" }])}><Plus size={14} aria-hidden /> Add a product</Button>
          </div>
          {lines.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">Load what the warehouse holds, then type what you really counted. Or add products one at a time.</p>}
          {lines.map((l, i) => <CountLineRow key={l.key} line={l} index={i} onChange={(p) => change(l.key, p)} onRemove={() => setLines((all) => all.filter((x) => x.key !== l.key))} />)}
        </fieldset>
        <FormActions onCancel={onClose} busy={submit.isPending} submitLabel="Submit count" busyLabel="Submitting…" sticky />
      </form>
    </Drawer>
  );
}

function CountLineRow({ line, index, onChange, onRemove }: { line: Line; index: number; onChange: (p: Partial<Line>) => void; onRemove: () => void }) {
  const [search, setSearch] = useState("");
  const products = useProducts(1, 25, useDeferredValue(search), true);
  return (
    <div className="grid grid-cols-[1fr_7rem_2rem] items-start gap-2">
      {line.name && line.productId ? <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{line.name}</p> : (
        <SearchSelect label={`Product ${index + 1}`} value={line.productId} selectedLabel={line.name} query={search} onQueryChange={setSearch} loading={products.isFetching}
          items={(products.data?.items ?? []).filter((p) => !p.has_variants).map((p) => ({ id: p.id, label: p.name, hint: p.sku ?? undefined }))}
          onSelect={(id) => onChange({ productId: id, name: products.data?.items.find((p) => p.id === id)?.name ?? "" })} placeholder="Search products…" />
      )}
      <Input aria-label={`Counted quantity ${index + 1}`} inputMode="decimal" className="text-right tabular-nums" value={line.counted} onChange={(e) => onChange({ counted: e.target.value })} placeholder="Counted" />
      <Button type="button" size="sm" variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={onRemove}><Trash2 size={14} /></Button>
    </div>
  );
}
