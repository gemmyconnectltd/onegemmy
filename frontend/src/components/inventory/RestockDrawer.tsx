"use client";

import { useState } from "react";
import { PackagePlus, SlidersHorizontal, XCircle } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";

export type RestockMode = "restock" | "adjust";

export interface RestockValues {
  mode: RestockMode;
  qty: number;
  reason: string;
  notes: string;
  newStock?: number;
}

interface RestockDrawerProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  currentStock: number;
  onSubmit: (values: RestockValues) => Promise<void>;
}

const RESTOCK_REASONS = ["Purchase from supplier", "Return from customer", "Found in warehouse", "Other"];
const ADJUST_REASONS  = ["Damaged goods", "Theft / loss", "Miscounted", "Expired", "Other"];

export function RestockDrawer({ open, onClose, productName, currentStock, onSubmit }: RestockDrawerProps) {
  const [mode, setMode]         = useState<RestockMode>("restock");
  const [qty, setQty]           = useState("");
  const [reason, setReason]     = useState(RESTOCK_REASONS[0]);
  const [notes, setNotes]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const qtyNum   = Number(qty);
  const newStock = mode === "restock" ? currentStock + qtyNum : qtyNum;
  const diff     = newStock - currentStock;
  const valid    = qty.trim() !== "" && qtyNum >= 0 && (mode === "restock" ? qtyNum > 0 : true);

  const reset = () => {
    setQty(""); setNotes(""); setError(null);
    setMode("restock"); setReason(RESTOCK_REASONS[0]);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ mode, qty: qtyNum, reason, notes, newStock });
      reset();
      onClose();
    } catch (err: unknown) {
      if (err instanceof TypeError) {
        setError("Cannot reach the server. Check your connection.");
      } else {
        const detail = (err as { detail?: string })?.detail;
        setError(detail || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={mode === "restock" ? "Restock Product" : "Adjust Stock"}
      description={productName}
      size="md"
      footer={
        <form onSubmit={handleSubmit}>
          <FormFooter
            submitLabel={submitting ? "Saving…" : mode === "restock" ? "Add Stock" : "Apply Adjustment"}
            onCancel={handleClose}
            disabled={!valid || submitting}
          />
        </form>
      }
    >
      <div className="p-5 space-y-5">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-lg">
            <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2">
          {([
            { key: "restock", label: "Restock", icon: PackagePlus },
            { key: "adjust",  label: "Adjust",  icon: SlidersHorizontal },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setReason(key === "restock" ? RESTOCK_REASONS[0] : ADJUST_REASONS[0]);
                setQty("");
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold border transition-colors rounded-lg ${
                mode === key
                  ? "bg-accent text-white border-accent"
                  : "border-border text-muted hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Current stock info */}
        <div className="bg-surface rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted font-medium">Current stock</span>
          <span className="text-sm font-bold text-foreground tabular-nums">{currentStock} units</span>
        </div>

        {/* Qty input */}
        <Field
          label={mode === "restock" ? "Quantity to add" : "New stock count"}
          required
          hint={
            mode === "restock"
              ? `New total will be ${qty ? newStock : "—"} units`
              : qty
              ? `${diff >= 0 ? "+" : ""}${diff} units (${diff >= 0 ? "increase" : "decrease"})`
              : undefined
          }
        >
          <Input
            type="number"
            min={mode === "restock" ? "1" : "0"}
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(null); }}
            placeholder={mode === "restock" ? "e.g. 50" : `e.g. ${currentStock}`}
            autoFocus
            className="font-mono"
          />
        </Field>

        {/* Reason */}
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {(mode === "restock" ? RESTOCK_REASONS : ADJUST_REASONS).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>

        {/* Notes */}
        <Field label="Notes (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details..."
            rows={3}
          />
        </Field>

        {/* Preview */}
        {qty && valid && (
          <div className={`rounded-lg px-4 py-3 border ${
            mode === "restock" || diff >= 0
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
          }`}>
            <p className="text-xs font-semibold text-foreground/70 mb-1">Stock after this action</p>
            <p className={`text-xl font-extrabold tabular-nums ${
              mode === "restock" || diff >= 0 ? "text-emerald-700" : "text-amber-700"
            }`}>
              {newStock} <span className="text-sm font-medium">units</span>
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
