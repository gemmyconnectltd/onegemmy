"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { EMPTY_BRANCH, branchProblem, isDirty, validateBranch, type BranchForm as Values } from "@/lib/branchView";

/** The one branch form: used to add a branch and to edit one, so both validate and report problems the same way. */
export function BranchForm({ initial = EMPTY_BRANCH, others, submitLabel, onSubmit, onCancel, onDirtyChange, disabled, focusFirst }: {
  initial?: Values;
  /** Names of the business's other branches, for the duplicate check. */
  others: string[];
  submitLabel: string;
  onSubmit: (values: Values) => Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
  /** Put the cursor in the name field (when adding a branch, not when editing). */
  focusFirst?: boolean;
}) {
  const [form, setForm] = useState<Values>(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<{ kind: "limit" | "other"; message: string } | null>(null);
  const errors = useMemo(() => validateBranch(form, others), [form, others]);
  const dirty = isDirty(form, initial);
  const invalid = Object.keys(errors).length > 0;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k: keyof Values, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); setProblem(null); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid || saving) return;
    setSaving(true);
    setProblem(null);
    try { await onSubmit({ ...form, name: form.name.trim(), location: form.location.trim(), phone: form.phone.trim(), email: form.email.trim() }); setSaved(true); }
    catch (err: unknown) { setProblem(branchProblem(err)); }
    finally { setSaving(false); }
  };
  const shown = (k: keyof typeof errors) => (touched || form[k as keyof Values]) ? errors[k] : undefined;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Branch name" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Remera" aria-invalid={!!shown("name")} disabled={disabled} autoFocus={focusFirst} />{shown("name") && <p role="alert" className="mt-1 text-[11px] text-red-600">{shown("name")}</p>}</Field>
        <Field label="Location" hint="Street, area or city." className="sm:col-span-2"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="KG 11 Ave, Remera, Kigali" disabled={disabled} /></Field>
        <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+250 788 000 000" aria-invalid={!!shown("phone")} disabled={disabled} />{shown("phone") && <p role="alert" className="mt-1 text-[11px] text-red-600">{shown("phone")}</p>}</Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="remera@business.com" aria-invalid={!!shown("email")} disabled={disabled} />{shown("email") && <p role="alert" className="mt-1 text-[11px] text-red-600">{shown("email")}</p>}</Field>
      </div>
      {problem?.kind === "limit" && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Your plan&apos;s branch limit is reached</p>
          <p className="mt-0.5">{problem.message}. Deactivate a branch you no longer use, or contact support.</p>
        </div>
      )}
      {problem?.kind === "other" && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-700 dark:text-red-400">{problem.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || saving || !dirty}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />}{saving ? "Saving…" : submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>}
        {saved && !dirty && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600"><CheckCircle2 size={13} /> Saved</span>}
      </div>
    </form>
  );
}
