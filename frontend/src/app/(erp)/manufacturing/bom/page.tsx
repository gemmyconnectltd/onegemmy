"use client";
import { useState } from "react";
import { Layers, Plus, Trash2, Edit2, Package, AlertCircle, X } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useBoms, useProducts, useCreateBom, useUpdateBom, useDeleteBom } from "@/lib/api/hooks";
import type { ApiBom } from "@/lib/api/manufacturing";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const COLOR = "#0f766e";

type ComponentRow = { id: string; product_id: string; quantity_required: number };
type FormState = { name: string; product_id: string; notes: string; components: ComponentRow[] };
const EMPTY_FORM: FormState = { name: "", product_id: "", notes: "", components: [] };

export default function BomPage() {
  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiBom | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const bomsQ = useBoms(1, 500);
  const productsQ = useProducts(1, 500);
  const loading = bomsQ.isLoading || productsQ.isLoading;
  const boms = bomsQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  const loadError = bomsQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load bills of materials" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createBom = useCreateBom();
  const updateBom = useUpdateBom();
  const deleteBom = useDeleteBom();
  const saving = createBom.isPending || updateBom.isPending;

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, components: [] });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (bom: ApiBom) => {
    setEditing(bom);
    setForm({
      name: bom.name,
      product_id: bom.product_id ?? "",
      notes: "",
      components: bom.items.map((i) => ({
        id: i.id,
        product_id: i.component_product_id ?? "",
        quantity_required: i.quantity_required,
      })),
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => setShowForm(false);

  const addComponent = () =>
    setForm((f) => ({ ...f, components: [...f.components, { id: crypto.randomUUID(), product_id: products[0]?.id ?? "", quantity_required: 1 }] }));
  const setComponent = (i: number, patch: Partial<ComponentRow>) =>
    setForm((f) => ({ ...f, components: f.components.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const removeComponent = (i: number) =>
    setForm((f) => ({ ...f, components: f.components.filter((_, idx) => idx !== i) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Give this BOM a name.");
      return;
    }
    const product = products.find((p) => p.id === form.product_id);
    const items = form.components
      .filter((c) => c.product_id)
      .map((c) => {
        const p = products.find((x) => x.id === c.product_id);
        return { component_product_id: c.product_id, component_product_name: p?.name ?? null, quantity_required: c.quantity_required };
      });
    const payload = {
      name: form.name.trim(),
      product_id: form.product_id || null,
      product_name: product?.name ?? null,
      notes: form.notes.trim() || null,
      items,
    };
    if (editing) {
      updateBom.mutate({ id: editing.id, data: payload }, {
        onSuccess: () => { setError(null); closeForm(); },
        onError: (err: Error) => setFormError((err as { detail?: string })?.detail ?? "Failed to update BOM"),
      });
    } else {
      createBom.mutate(payload, {
        onSuccess: () => { setError(null); closeForm(); },
        onError: (err: Error) => setFormError((err as { detail?: string })?.detail ?? "Failed to create BOM"),
      });
    }
  };

  const handleDelete = (bom: ApiBom) => {
    if (!confirm(`Delete "${bom.name}"?`)) return;
    deleteBom.mutate(bom.id, {
      onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete BOM"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Bill of Materials</h1>
          <p className="text-sm text-muted mt-0.5">{loading ? "Loading..." : `${boms.length} recipes`}</p>
        </div>
        <Button color={COLOR} onClick={openAdd}><Plus size={15} /> New BOM</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <PageLoader variant="compact" />
        ) : boms.length === 0 ? (
          <div className="py-20 text-center">
            <Layers size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No bills of materials yet</p>
            <p className="text-xs text-muted mt-1 mb-4">Save a reusable component recipe for a finished product</p>
            <Button color={COLOR} size="sm" onClick={openAdd}><Plus size={13} /> New BOM</Button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Finished Product</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Components</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {boms.map((b) => (
                <tr key={b.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="px-4 py-3 text-sm font-bold text-foreground">{b.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package size={13} className="text-muted" />
                      <span className="text-sm font-medium text-foreground">{b.product_name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {b.items.length > 0
                      ? b.items.map((i) => `${i.component_product_name ?? "?"} ×${i.quantity_required}`).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openEdit(b)}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold">
                        <Edit2 size={13} /> Edit
                      </button>
                      <button onClick={() => handleDelete(b)}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={showForm} onClose={closeForm}
        title={editing ? "Edit BOM" : "New BOM"}
        description="A reusable component recipe for a finished product"
        size="md">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Recipe" />
          </Field>
          <Field label="Finished Product">
            <Select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
              <option value="">Select product...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-muted">Components</p>
              <button type="button" onClick={addComponent}
                className="text-[12px] font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
                style={{ color: COLOR }}>
                <Plus size={13} /> Add Component
              </button>
            </div>
            {form.components.length === 0 ? (
              <p className="text-[12px] text-muted bg-surface border border-dashed border-border rounded-lg px-3 py-2.5">
                No components yet.
              </p>
            ) : (
              <div className="space-y-2">
                {form.components.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Select value={c.product_id}
                      onChange={(e) => setComponent(i, { product_id: e.target.value })} className="flex-1">
                      <option value="">Select component...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                    </Select>
                    <Input type="number" min={1} value={c.quantity_required}
                      onChange={(e) => setComponent(i, { quantity_required: Number(e.target.value) || 1 })}
                      className="w-24 text-center" />
                    <button type="button" onClick={() => removeComponent(i)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold flex-shrink-0">
                      <X size={14} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Notes">
            <Textarea rows={2} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Production notes..." />
          </Field>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormFooter
            submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Create BOM"}
            onCancel={closeForm}
            disabled={saving || !form.name.trim()}
            color={COLOR}
          />
        </form>
      </Drawer>
    </div>
  );
}
