"use client";
import { useState } from "react";
import Link from "next/link";
import { Archive, CalendarCheck, ClipboardEdit, FlaskConical, Lock, Trash2 } from "lucide-react";
import { OP_HINT, OP_LABEL, type DmFilters, type DmModuleInfo, type DmOperation } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Notice } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { hasDateLimit, type Sel } from "./RecordExplorer";

const ICON = { archive: Archive, delete: Trash2, clean_test: FlaskConical, correct: ClipboardEdit, reset: CalendarCheck } as const;
const ORDER: DmOperation[] = ["archive", "correct", "delete", "clean_test", "reset"];
const FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  customers: [{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" }, { key: "tin", label: "TIN" }],
  products: [{ key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "barcode", label: "Barcode" }, { key: "subcategory", label: "Subcategory" }, { key: "min_stock", label: "Minimum stock", type: "number" }],
  warehouses: [{ key: "name", label: "Name" }, { key: "address", label: "Address" }, { key: "description", label: "Description" }],
};

/** Choose what to do with the selected records and set it up. Nothing runs from here: the next step is a preview of the exact impact. */
export function OperationPanel({ initialOp, info, sel, count, filters, tenantId, salespeople, busy, error, onPrepare }: {
  initialOp?: DmOperation; info: DmModuleInfo; sel: Sel; count: number; filters: DmFilters; tenantId: string; salespeople: { id: string; name: string }[]; busy: boolean; error: string | null;
  onPrepare: (operation: DmOperation, payload: Record<string, unknown>) => void;
}) {
  const [op, setOp] = useState<DmOperation | null>(initialOp ?? null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [action, setAction] = useState<"salesperson" | "notes" | "void">("notes");
  const [person, setPerson] = useState("");
  const [notes, setNotes] = useState("");
  const [allDates, setAllDates] = useState(false);
  const broad = sel.mode === "matching" && !hasDateLimit(filters) && !!op && ["archive", "delete", "clean_test"].includes(op);
  const none = sel.mode === "none";

  function payload(): Record<string, unknown> | null {
    if (!op) return null;
    const p: Record<string, unknown> = broad ? { confirm_all_dates: allDates } : {};
    if (op === "correct") {
      if (info.key === "sales") {
        p.action = action;
        if (action === "notes") p.notes = notes;
        if (action === "salesperson") p.salesperson_id = person;
      } else {
        const changed = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, FIELDS[info.key]?.find((f) => f.key === k)?.type === "number" ? Number(v) : v.trim()]));
        p.fields = changed;
      }
    }
    return p;
  }
  const ready = !!op && !none && !(broad && !allDates) && !(op === "correct" && (count !== 1 || (info.key === "sales" ? (action === "salesperson" && !person) : Object.values(fields).every((v) => !v.trim()))));

  const hint = (o: DmOperation) => (info.operations[o].supported ? OP_HINT[o] : info.operations[o].why);
  return (
    // Always on top: the choice of action stays in view while the records scroll underneath.
    <section aria-label="Actions" className={cn("top-14 z-20 space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm", op ? "sm:sticky" : "sticky")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13px]" role="status">
          {none ? <span className="text-muted">Choose records below, then an action.</span> : <span><strong>{count.toLocaleString()}</strong> {count === 1 ? info.noun : `${info.noun}s`} selected</span>}
        </p>
        <div role="radiogroup" aria-label="Action" className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {ORDER.map((o) => {
            const cap = info.operations[o];
            const Icon = ICON[o];
            const on = op === o;
            const danger = o === "delete" || o === "clean_test";
            return (
              <button key={o} type="button" role="radio" aria-checked={on} aria-label={`${OP_LABEL[o]}${cap.supported ? "" : ` (not available: ${cap.why})`}`} title={hint(o)} disabled={!cap.supported}
                onClick={() => setOp(on ? null : o)}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                  on ? (danger ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400" : "border-accent bg-accent/10 text-accent") : "border-border hover:bg-surface",
                  !cap.supported && "cursor-not-allowed opacity-50 hover:bg-transparent")}>
                {cap.supported ? <Icon size={14} aria-hidden /> : <Lock size={13} aria-hidden />}{OP_LABEL[o]}
              </button>
            );
          })}
        </div>
      </div>

      {op && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[13.5px] font-semibold">{OP_LABEL[op]}</p><p className="text-[12.5px] text-muted">{OP_HINT[op]}</p></div>
            <Button variant="ghost" size="sm" onClick={() => setOp(null)}>Close</Button></div>
          <div className="@container">
            <div className="grid gap-3 @2xl:grid-cols-2">
              {op === "archive" && <p className="text-[12.5px] text-muted @2xl:col-span-2">The records leave daily use. Their sales, payments, books entries and audit history stay exactly as they are.</p>}
              {(op === "delete" || op === "clean_test") && <div className="@2xl:col-span-2"><Notice tone="red">Permanent. Only records nothing else depends on are removed; everything else is listed as blocked with the supported alternative. There is no backup to restore from.{op === "clean_test" ? " Records are never treated as test data automatically: you review them and confirm they are disposable." : ""}</Notice></div>}
              {op === "correct" && count !== 1 && !none && <div className="@2xl:col-span-2"><Notice tone="amber">Corrections are made one record at a time. Select a single record.</Notice></div>}
              {op === "correct" && none && <p className="text-[12.5px] text-muted @2xl:col-span-2">Select the one record to correct.</p>}
              {op === "correct" && info.key === "sales" && <>
                <Field label="Correction"><Select value={action} onChange={(e) => setAction(e.target.value as typeof action)}><option value="notes">Edit the notes</option><option value="salesperson">Change the salesperson</option><option value="void">Void the sale (reverse it)</option></Select></Field>
                {action === "notes" && <Field label="New notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>}
                {action === "salesperson" && <Field label="Salesperson"><Select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Choose…</option>{salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
                {action === "void" && <p className="self-end text-[12.5px] text-muted">Reverses the sale&apos;s books entries and payments and returns the stock. Nothing is deleted. Needs a second administrator&apos;s approval.</p>}
              </>}
              {op === "correct" && info.key !== "sales" && FIELDS[info.key] && <>
                <p className="text-[12px] text-muted @2xl:col-span-2">Fill in only what should change. You will see before and after next.</p>
                {FIELDS[info.key].map((f) => <Field key={f.key} label={f.label}><Input type={f.type ?? "text"} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} /></Field>)}
              </>}
              {op === "reset" && (
                <div className="space-y-2 text-[12.5px] text-muted @2xl:col-span-2"><p>Closing a period is done for the whole business, in three steps: closing date, opening balances, review.</p>
                  <Link href={`/data-management/close?tenant=${tenantId}`} className="inline-flex"><Button size="sm">Start closing a period</Button></Link></div>
              )}
              {broad && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12.5px] @2xl:col-span-2"><input type="checkbox" className="mt-0.5" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />
                  <span>No date range is set, so this covers <strong>every date</strong>. I mean all dates.</span></label>
              )}
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}
          {op !== "reset" && (
            <div className="flex flex-wrap items-center gap-3"><Button disabled={!ready || busy} onClick={() => { const p = payload(); if (p) onPrepare(op, p); }}>{busy ? "Checking…" : "Preview impact"}</Button>
              <p className="text-[11.5px] text-muted">Preview changes nothing. It shows exactly which records qualify and why others do not.</p></div>
          )}
        </div>
      )}
    </section>
  );
}
