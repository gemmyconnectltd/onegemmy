"use client";

import { useState } from "react";
import { CalendarClock, MessageSquare, X } from "lucide-react";
import type { FeatureControl, FeatureStatus } from "@/lib/api/admin";
import { useCancelFeatureSchedule, useSetFeatureStatus } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ReasonDialog } from "@/components/features/ReasonDialog";
import { UsageCard } from "@/components/usage/UsageShared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { STATUS_META, errorText } from "./status";
import { ImpactNote } from "./RuleEditor";

/** Status, the message businesses see, and an optional time for the change. */
export function StatusPanel({ c }: { c: FeatureControl }) {
  const save = useSetFeatureStatus();
  const cancel = useCancelFeatureSchedule();
  const [status, setStatus] = useState<FeatureStatus>(c.status);
  const [message, setMessage] = useState(c.message ?? "");
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [at, setAt] = useState("");
  const [dialog, setDialog] = useState<"save" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = status !== c.status || (message.trim() || null) !== (c.message ?? null) || when === "schedule";
  const disruptive = when === "now" && status !== c.status && (status === "inactive" || status === "coming_soon");
  const shown = (message.trim() || c.default_messages[status] || "").trim();

  const submit = async (reason: string) => {
    setError(null);
    try {
      if (dialog === "cancel") await cancel.mutateAsync({ key: c.key, reason });
      else await save.mutateAsync({ key: c.key, data: { status, message: message.trim() || null, when, reason,
        ...(when === "schedule" ? { at: new Date(at).toISOString() } : {}), ...(disruptive ? { confirm_key: c.key } : {}) } });
      setDialog(null);
      setWhen("now");
    } catch (e: unknown) { setError(errorText(e)); }
  };

  return <div className="space-y-4">
    <UsageCard title="Now" subtitle="What businesses get at this moment">
      <div className="space-y-3 py-1">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_META[c.status].tone} dot>{STATUS_META[c.status].label}</Badge><span className="text-[13px] text-muted">{STATUS_META[c.status].effect}</span></div>
        {(c.message || c.default_messages[c.status]) && <p className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-[13px]"><MessageSquare size={14} aria-hidden className="mt-0.5 flex-shrink-0 text-muted" />{c.message || c.default_messages[c.status]}</p>}
        {c.scheduled_status && c.scheduled_at && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <p className="flex items-center gap-2 text-[13px]"><CalendarClock size={14} aria-hidden className="text-muted" />Changes to <Badge tone={STATUS_META[c.scheduled_status].tone}>{STATUS_META[c.scheduled_status].label}</Badge> on {fmtDateTime(c.scheduled_at)}</p>
          <Button variant="ghost" size="sm" onClick={() => { setError(null); setDialog("cancel"); }}><X size={13} /> Cancel schedule</Button>
        </div>}
      </div>
    </UsageCard>

    <UsageCard title="Change status" subtitle="Pick what this feature should be. Records are never deleted.">
      <div className="space-y-5 py-1">
        <fieldset>
          <legend className="sr-only">Status</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{c.statuses.map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
            className={cn("flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors", status === s ? "border-accent bg-accent/5" : "border-border hover:bg-surface/60")}>
            <span className="flex items-center justify-between gap-2"><Badge tone={STATUS_META[s].tone} dot>{STATUS_META[s].label}</Badge>{s === c.status && <span className="text-[11px] text-muted">current</span>}</span>
            <span className="text-[12px] leading-relaxed text-muted">{STATUS_META[s].effect}</span>
          </button>)}</div>
        </fieldset>
        <Field label="Message businesses see" hint="Leave empty to use the standard message shown as the placeholder.">
          <Textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={c.default_messages[status] || "No message for Active"} />
        </Field>
        {shown && <p className="text-[12px] text-muted">Preview: <span className="text-foreground">{shown}</span></p>}
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium">When</legend>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} /> Now</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="when" checked={when === "schedule"} onChange={() => setWhen("schedule")} /> At a set time</label>
            {when === "schedule" && <Input type="datetime-local" aria-label="Date and time of the change" value={at} onChange={(e) => setAt(e.target.value)} className="w-auto" />}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button onClick={() => { setError(null); setDialog("save"); }} disabled={!changed || (when === "schedule" && !at)}>{when === "schedule" ? "Schedule change…" : "Apply change…"}</Button>
          {changed && <Button variant="ghost" onClick={() => { setStatus(c.status); setMessage(c.message ?? ""); setWhen("now"); setAt(""); }}>Reset</Button>}
        </div>
      </div>
    </UsageCard>

    {dialog && <ReasonDialog
      title={dialog === "cancel" ? "Cancel the scheduled change?" : when === "schedule" ? `Schedule ${STATUS_META[status].label} for ${c.name}?` : `Set ${c.name} to ${STATUS_META[status].label}?`}
      message={dialog === "cancel" ? "The status stays as it is now." : STATUS_META[status].effect}
      confirmLabel={dialog === "cancel" ? "Cancel schedule" : when === "schedule" ? "Schedule" : "Apply"} danger={disruptive}
      requireKey={dialog === "save" && disruptive ? c.key : undefined} pending={save.isPending || cancel.isPending} error={error}
      extra={dialog === "save" ? <ImpactNote impact={c.impact} /> : undefined}
      onSubmit={(r) => void submit(r)} onClose={() => setDialog(null)} />}
  </div>;
}
