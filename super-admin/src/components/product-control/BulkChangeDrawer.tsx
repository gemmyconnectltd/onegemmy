"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ActionRule, BulkChange, BulkPreview, FeatureAction, FeatureStatus } from "@/lib/api/admin";
import { useApplyBulkChange, usePreviewBulkChange } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { ACTION_META, STATUS_META, errorText } from "./status";
import { RuleEditor } from "./RuleEditor";

/** One change for many modules and parts: choose it, preview who it reaches, then apply all or nothing. */
export function BulkChangeDrawer({ items, onClose, onDone }: { items: { key: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const preview = usePreviewBulkChange();
  const apply = useApplyBulkChange();
  const [op, setOp] = useState<BulkChange["op"]>("status");
  const [status, setStatus] = useState<FeatureStatus>("maintenance");
  const [message, setMessage] = useState("");
  const [actions, setActions] = useState<Partial<Record<FeatureAction, ActionRule>>>({});
  const [percent, setPercent] = useState(100);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [seen, setSeen] = useState<BulkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = (): BulkChange => ({ keys: items.map((i) => i.key), op, reason: reason.trim(),
    ...(op === "status" ? { status, message: message.trim() || null } : {}), ...(op === "actions" ? { actions } : {}),
    ...(op === "rollout" ? { rollout_percent: percent } : {}), ...(seen?.needs_confirm ? { confirm } : {}) });
  const reset = () => { setSeen(null); setConfirm(""); setError(null); };
  const ready = reason.trim().length >= 3 && (op !== "actions" || Object.keys(actions).length > 0);

  const doPreview = async () => {
    setError(null);
    try { setSeen((await preview.mutateAsync(change())).data); } catch (e: unknown) { setError(errorText(e, "Could not preview.")); }
  };
  const doApply = async () => {
    setError(null);
    try { await apply.mutateAsync(change()); onDone(); } catch (e: unknown) { setError(errorText(e)); }
  };

  return <Drawer open onClose={onClose} side="right" size="xl" title={`Change ${items.length} feature${items.length === 1 ? "" : "s"} together`}
    description="Applied to all of them in one go, or to none if anything fails."
    footer={<div className="flex items-center justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      {!seen ? <Button disabled={!ready || preview.isPending} onClick={() => void doPreview()}>{preview.isPending && <Loader2 size={13} className="animate-spin" />}Preview impact</Button>
        : <Button variant={seen.needs_confirm ? "destructive" : "primary"} disabled={apply.isPending || (seen.needs_confirm && confirm !== seen.confirm_text)} onClick={() => void doApply()}>
          {apply.isPending && <Loader2 size={13} className="animate-spin" />}Apply to {items.length}</Button>}
    </div>}>
    <div className="space-y-5 px-5 py-4">
      <div className="flex flex-wrap gap-1.5">{items.map((i) => <Badge key={i.key} tone="slate">{i.name}</Badge>)}</div>
      <Field label="Change">
        <Select value={op} onChange={(e) => { setOp(e.target.value as BulkChange["op"]); reset(); }}>
          <option value="status">Set status</option><option value="kill">Stop now (kill switch)</option><option value="unkill">Restart (kill switch off)</option>
          <option value="actions">Action rules</option><option value="rollout">Rollout percentage</option>
        </Select>
      </Field>
      {op === "status" && <>
        <Field label="Status"><Select value={status} onChange={(e) => { setStatus(e.target.value as FeatureStatus); reset(); }}>
          {(Object.keys(STATUS_META) as FeatureStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </Select></Field>
        <p className="text-[12px] text-muted">{STATUS_META[status].effect}</p>
        <Field label="Message businesses see" hint="Empty: each feature's standard message."><Textarea rows={2} maxLength={500} value={message} onChange={(e) => { setMessage(e.target.value); reset(); }} /></Field>
      </>}
      {op === "actions" && <section className="space-y-3" aria-label="Action rules">
        {(Object.keys(ACTION_META) as FeatureAction[]).map((a) => <div key={a} className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-start">
          <p className="pt-2 text-sm font-medium">{ACTION_META[a].label}</p>
          <RuleEditor inherit label={ACTION_META[a].label} value={actions[a]} onChange={(v) => { const n = { ...actions }; if (v === undefined) delete n[a]; else n[a] = v; setActions(n); reset(); }} />
        </div>)}
        <p className="text-[12px] text-muted">“Same as every business” leaves that action as it is on each feature.</p>
      </section>}
      {op === "rollout" && <Field label={`Rollout: ${percent}%`}><input type="range" min={0} max={100} step={5} value={percent} onChange={(e) => { setPercent(Number(e.target.value)); reset(); }} aria-label="Rollout percentage" className="w-full accent-[var(--primary)]" /></Field>}
      <Field label="Reason" required hint="Saved in the audit log of every feature changed."><Textarea rows={2} maxLength={255} value={reason} onChange={(e) => { setReason(e.target.value); reset(); }} /></Field>

      {seen && <section aria-label="Impact" className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-sm font-semibold">Reaches up to {seen.total_entitled} business{seen.total_entitled === 1 ? "" : "es"}; {seen.total_active_30d} made changes in these features in the last 30 days.</p>
        <ul className="divide-y divide-border">{seen.items.map((i) => <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
          <span className="font-medium">{i.name}</span>
          <span className="text-muted">{i.entitled} with the module · {i.active_30d} active{i.dependents.length ? ` · affects ${i.dependents.map((d) => d.name).join(", ")}` : ""}{i.exceptions ? ` · ${i.exceptions} exceptions kept` : ""}</span>
        </li>)}</ul>
        {seen.needs_confirm && seen.confirm_text && <Field label={`Type ${seen.confirm_text} to confirm`}><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>}
      </section>}
      {error && <p role="alert" className="text-[13px] font-medium text-[var(--error)]">{error}</p>}
    </div>
  </Drawer>;
}
