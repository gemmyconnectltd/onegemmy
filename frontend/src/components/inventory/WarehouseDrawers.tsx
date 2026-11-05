"use client";
import { useDeferredValue, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Warehouse } from "@/lib/api";
import { useCreateWarehouse, useMyBranches, useProducts, useReceiveStock, useSalesTeam, useUpdateWarehouse } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { FormActions, FormErrorSummary, FormSection, FormRow } from "@/components/ui/FormKit";
import { SearchSelect } from "@/components/ui/SearchSelect";

const fail = (cause: unknown) => (cause as { detail?: string })?.detail ?? (cause as Error)?.message ?? "That didn't work. Please try again.";

/** Create or edit a warehouse. The code is optional on a new one: the next free WH-number is used. */
export function WarehouseEditor({ initial, onClose }: { initial?: Warehouse; onClose: () => void }) {
  const branches = useMyBranches().data?.items ?? [];
  const team = useSalesTeam().data ?? [];
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [branch, setBranch] = useState(initial?.branch_id ?? "");
  const [manager, setManager] = useState(initial?.manager_id ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const busy = create.isPending || update.isPending;
  const t = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the warehouse a name.");
    const data = { name: name.trim(), code: code.trim() || null, branch_id: branch || null, manager_id: manager || null, address: address.trim() || null, description: description.trim() || null };
    try { if (initial) await update.mutateAsync({ id: initial.id, data }); else await create.mutateAsync(data); setDirty(false); onClose(); }
    catch (cause) { setError(fail(cause)); }
  }
  return (
    <Drawer open onClose={() => !busy && onClose()} size="lg" title={initial ? `Edit ${initial.name}` : "New warehouse"} description="A place where stock is kept. A business can have several." dirty={dirty}>
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <FormErrorSummary errors={error} />
        <fieldset disabled={busy} className="space-y-4">
          <FormSection title="Warehouse" variant="plain">
            <Field label="Name" required><Input required maxLength={150} value={name} onChange={(e) => t(setName)(e.target.value)} /></Field>
            <Field label="Code" hint={initial ? "Unique in your business." : "Leave empty to use the next WH number."}><Input maxLength={30} value={code} onChange={(e) => t(setCode)(e.target.value)} placeholder="WH-002" /></Field>
            <Field label="Branch" hint="The branch whose sales are taken from this warehouse."><Select value={branch} onChange={(e) => t(setBranch)(e.target.value)}><option value="">Not tied to a branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="Responsible manager"><Select value={manager} onChange={(e) => t(setManager)(e.target.value)}><option value="">Nobody yet</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <FormRow><Field label="Address or location"><Input maxLength={500} value={address} onChange={(e) => t(setAddress)(e.target.value)} /></Field></FormRow>
            <FormRow><Field label="Description"><Textarea rows={3} maxLength={2000} value={description} onChange={(e) => t(setDescription)(e.target.value)} /></Field></FormRow>
          </FormSection>
        </fieldset>
        <FormActions onCancel={onClose} busy={busy} submitLabel={initial ? "Save changes" : "Create warehouse"} sticky />
      </form>
    </Drawer>
  );
}

type Line = { key: string; productId: string; name: string; quantity: string };

/** Books goods that arrived at a warehouse without a purchase order. Goods bought on a purchase order are received from Purchases. */
export function ReceiveStockDrawer({ warehouse, onClose }: { warehouse: Warehouse; onClose: () => void }) {
  const receive = useReceiveStock();
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: "", name: "", quantity: "1" }]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = (key: string, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = lines.filter((l) => l.productId);
    if (!filled.length) return setError("Choose at least one product.");
    if (filled.some((l) => !(Number(l.quantity) > 0))) return setError("Every quantity must be above zero.");
    try { await receive.mutateAsync({ id: warehouse.id, data: { lines: filled.map((l) => ({ product_id: l.productId, quantity: Number(l.quantity) })), reference: reference.trim() || null, note: note.trim() || null } }); onClose(); }
    catch (cause) { setError(fail(cause)); }
  }
  return (
    <Drawer open onClose={() => !receive.isPending && onClose()} size="lg" title={`Receive stock · ${warehouse.name}`} description="Goods that arrived here without a purchase order.">
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <FormErrorSummary errors={error} />
        <fieldset disabled={receive.isPending} className="space-y-3">
          {lines.map((l, i) => <ReceiveLine key={l.key} line={l} index={i} onChange={(p) => change(l.key, p)} onRemove={lines.length > 1 ? () => setLines((all) => all.filter((x) => x.key !== l.key)) : undefined} />)}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((all) => [...all, { key: crypto.randomUUID(), productId: "", name: "", quantity: "1" }])}><Plus size={14} aria-hidden /> Add product</Button>
          <FormSection title="Details" variant="plain">
            <Field label="Reference" hint="Delivery note or document number."><Input maxLength={50} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Field label="Note"><Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </FormSection>
        </fieldset>
        <FormActions onCancel={onClose} busy={receive.isPending} submitLabel="Receive stock" busyLabel="Receiving…" sticky />
      </form>
    </Drawer>
  );
}

function ReceiveLine({ line, index, onChange, onRemove }: { line: Line; index: number; onChange: (p: Partial<Line>) => void; onRemove?: () => void }) {
  const [search, setSearch] = useState("");
  const products = useProducts(1, 25, useDeferredValue(search), true);
  return (
    <div className="grid grid-cols-[1fr_6rem_2rem] items-start gap-2">
      <SearchSelect label={`Product ${index + 1}`} value={line.productId} selectedLabel={line.name} query={search} onQueryChange={setSearch} loading={products.isFetching}
        items={(products.data?.items ?? []).filter((p) => !p.has_variants).map((p) => ({ id: p.id, label: p.name, hint: p.sku ?? undefined }))}
        onSelect={(id) => onChange({ productId: id, name: products.data?.items.find((p) => p.id === id)?.name ?? "" })} placeholder="Search products…" emptyText="No products without variants match" />
      <Input aria-label={`Quantity ${index + 1}`} inputMode="decimal" className="text-right tabular-nums" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
      {onRemove ? <Button type="button" size="sm" variant="ghost" aria-label={`Remove product ${index + 1}`} onClick={onRemove}><Trash2 size={14} /></Button> : <span />}
    </div>
  );
}
