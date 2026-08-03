"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, PackagePlus, ChevronDown, ChevronUp } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { type ApiVariant } from "@/lib/api";
import { useProductVariants, useCreateVariant, useUpdateVariant, useRestockVariant, useDeleteVariant } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  variants?: ApiVariant[];
  color?: string;
}

const EMPTY_FORM = { sku: "", price: 0, cost: 0, stock: 0, min_stock: 0, is_active: true, attributes: {} as Record<string, string> };
type FormState = typeof EMPTY_FORM;

function AttributeEditor({ attrs, onChange }: { attrs: Record<string, string>; onChange: (a: Record<string, string>) => void }) {
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  const entries = Object.entries(attrs);

  const add = () => {
    if (!key.trim()) return;
    onChange({ ...attrs, [key.trim()]: val.trim() });
    setKey(""); setVal("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-border text-foreground">
            {k}: {v}
            <button onClick={() => { const n = { ...attrs }; delete n[k]; onChange(n); }} className="text-muted hover:text-red-500 ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. Color"
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface/50 outline-none focus:border-foreground/30" />
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Red"
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface/50 outline-none focus:border-foreground/30" />
        <button onClick={add} className="px-3 py-1.5 text-sm font-semibold bg-surface border border-border rounded-lg hover:bg-surface/80">Add</button>
      </div>
    </div>
  );
}

function VariantForm({ initial, onSave, onCancel, color }: {
  initial: FormState;
  onSave: (f: FormState) => Promise<void>;
  onCancel: () => void;
  color: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormState, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 p-4 bg-surface/50 rounded-xl border border-border">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">SKU</label>
          <input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Optional"
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Stock</label>
          <input type="number" value={form.stock} onChange={(e) => set("stock", +e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Price</label>
          <input type="number" value={form.price} onChange={(e) => set("price", +e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Cost</label>
          <input type="number" value={form.cost} onChange={(e) => set("cost", +e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Attributes</label>
        <div className="mt-1">
          <AttributeEditor attrs={form.attributes} onChange={(a) => set("attributes", a)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
        <Button onClick={submit} disabled={saving} style={{ backgroundColor: color }} className="flex-1 rounded-lg text-[13px] text-white">
          {saving ? "Saving…" : "Save Variant"}
        </Button>
      </div>
    </div>
  );
}

export function VariantsDrawer({ open, onClose, productId, productName, variants, color = "#059669" }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiVariant | null>(null);
  const [restocking, setRestocking] = useState<ApiVariant | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [restockMode, setRestockMode] = useState<"restock" | "adjust">("restock");
  const [deleteTarget, setDeleteTarget] = useState<ApiVariant | null>(null);

  const { data } = useProductVariants(productId);
  const createVariant = useCreateVariant();
  const updateVariant = useUpdateVariant();
  const restockVariant = useRestockVariant();
  const deleteVariant = useDeleteVariant();
  const liveVariants = data ?? variants ?? [];

  const handleCreate = async (form: FormState) => {
    await createVariant.mutateAsync({ productId, data: { ...form, sku: form.sku || null } });
    setShowForm(false);
  };

  const handleUpdate = async (form: FormState) => {
    if (!editing) return;
    await updateVariant.mutateAsync({ productId, id: editing.id, data: { ...form, sku: form.sku || null } });
    setEditing(null);
  };

  const handleRestock = async () => {
    if (!restocking) return;
    await restockVariant.mutateAsync({ productId, id: restocking.id, data: { qty: restockQty, mode: restockMode } });
    setRestocking(null);
    setRestockQty(0);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteVariant.mutateAsync({ productId, id: deleteTarget.id });
    setDeleteTarget(null);
  };

  const attrLabel = (v: ApiVariant) => {
    const entries = Object.entries(v.attributes);
    return entries.length ? entries.map(([k, val]) => `${k}: ${val}`).join(" · ") : "No attributes";
  };

  return (
    <Drawer open={open} onClose={onClose} title={`Variants — ${productName}`} side="right" size="md">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{liveVariants.length} variant{liveVariants.length !== 1 ? "s" : ""}</p>
          {!showForm && !editing && (
            <Button onClick={() => setShowForm(true)} style={{ backgroundColor: color }} className="rounded-lg text-[13px] text-white">
              <Plus size={13} /> Add Variant
            </Button>
          )}
        </div>

        {showForm && (
          <VariantForm initial={EMPTY_FORM} onSave={handleCreate} onCancel={() => setShowForm(false)} color={color} />
        )}

        <div className="space-y-2">
          {liveVariants.map((v) => (
            <div key={v.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{attrLabel(v)}</p>
                  <p className="text-[11px] text-muted font-mono">{v.sku ?? "No SKU"} · {fmtMoney(v.price)} · Stock: {v.stock}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(v); setShowForm(false); }}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => { setRestocking(v); setRestockQty(0); setRestockMode("restock"); }}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                    <PackagePlus size={13} />
                  </button>
                  <button onClick={() => setDeleteTarget(v)}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {editing?.id === v.id && (
                <div className="p-3 border-t border-border bg-surface/30">
                  <VariantForm
                    initial={{ sku: v.sku ?? "", price: v.price, cost: v.cost, stock: v.stock, min_stock: v.min_stock, is_active: v.is_active, attributes: v.attributes }}
                    onSave={handleUpdate}
                    onCancel={() => setEditing(null)}
                    color={color}
                  />
                </div>
              )}

              {restocking?.id === v.id && (
                <div className="p-3 border-t border-border bg-surface/30 space-y-3">
                  <div className="flex gap-2">
                    {(["restock", "adjust"] as const).map((m) => (
                      <button key={m} onClick={() => setRestockMode(m)}
                        style={restockMode === m ? { backgroundColor: color } : {}}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${restockMode === m ? "text-white" : "border border-border text-muted"}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <input type="number" value={restockQty} onChange={(e) => setRestockQty(+e.target.value)}
                    placeholder={restockMode === "adjust" ? "Set stock to…" : "Add qty…"}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setRestocking(null)} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
                    <Button onClick={handleRestock} style={{ backgroundColor: color }} className="flex-1 rounded-lg text-[13px] text-white">Update Stock</Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {liveVariants.length === 0 && !showForm && (
            <div className="py-10 text-center">
              <p className="text-sm text-muted">No variants yet</p>
              <p className="text-xs text-muted/60 mt-1">Add a variant to track different sizes, colors, etc.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <p className="text-sm font-semibold text-foreground">Delete variant?</p>
            <p className="text-xs text-muted">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
              <Button variant="danger" onClick={handleDelete} className="flex-1 rounded-lg text-[13px]">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
