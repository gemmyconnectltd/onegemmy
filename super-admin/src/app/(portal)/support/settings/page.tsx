"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Mail, MessageCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmationDialog } from "@/components/support/ConfirmationDialog";
import { StatusBadge } from "@/components/support/StatusBadge";
import { SupportPageHeader } from "@/components/support/SupportPageHeader";
import { TableScroll } from "@/components/ui/TableScroll";
import { Toggle } from "@/components/ui/Toggle";
import { PRIORITIES } from "@/lib/support/logic";
import { useSupport } from "@/lib/support/store";
import type { QuickReply, SupportSettings } from "@/lib/support/types";

const control = "w-full rounded-lg border bg-card px-3 py-2 text-base outline-none focus:border-accent sm:text-[13.5px]";
const TIMEZONES = ["Africa/Kigali", "Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "Africa/Lagos", "UTC"];

function Card({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id={id} className="text-[15px] font-bold">{title}</h2>
      {description && <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"><div className="min-w-0"><p className="text-[13px] font-semibold">{title}</p>{hint && <p className="text-[11.5px] text-muted">{hint}</p>}</div><div className="flex-shrink-0">{children}</div></div>
);

function SettingsForm({ initial, flash, setFlash }: { initial: SupportSettings; flash: string; setFlash: (m: string) => void }) {
  const { data, actions } = useSupport();
  const [s, setS] = useState<SupportSettings>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [qr, setQr] = useState<{ id?: string; label: string; text: string } | null>(null);
  const [qrErr, setQrErr] = useState("");
  const [delQr, setDelQr] = useState<QuickReply | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(data?.settings);
  const set = <K extends keyof SupportSettings>(k: K, v: SupportSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  const save = () => {
    const e: Record<string, string> = {};
    if (s.autoCloseDays !== null && (!Number.isInteger(s.autoCloseDays) || s.autoCloseDays < 1 || s.autoCloseDays > 90)) e.autoClose = "Choose a number of days between 1 and 90.";
    if (s.autoCloseMessage.length > 300) e.autoCloseMessage = "Keep the message under 300 characters.";
    s.businessHours.forEach((d, i) => { if (d.open && d.from >= d.to) e[`h${i}`] = `${d.day}: closing time must be after opening time.`; });
    if (s.signatureEmail.length > 500 || s.signatureWhatsApp.length > 200) e.signature = "Signatures are too long (email 500, WhatsApp 200 characters).";
    setErrors(e);
    if (Object.keys(e).length) return;
    actions.updateSettings(s);
    setFlash("Settings saved in this demo browser. They are not stored on Pesaa servers.");
  };

  const saveQr = () => {
    if (!qr) return;
    if (!qr.label.trim() || !qr.text.trim()) { setQrErr("Add a label and the reply text."); return; }
    if (qr.label.length > 40 || qr.text.length > 500) { setQrErr("Label max 40 characters, text max 500."); return; }
    actions.upsertQuickReply({ id: qr.id, label: qr.label.trim(), text: qr.text.trim() });
    setQr(null); setQrErr("");
  };

  return (
    <div className="space-y-4">
      <SupportPageHeader title="Support settings" description="Channels, conversation defaults, team and notification preferences for Customer Support."
        actions={<><button type="button" disabled={!dirty} onClick={() => { setS(data!.settings); setErrors({}); }} className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface disabled:opacity-40">Discard</button><button type="button" disabled={!dirty} onClick={save} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"><Check size={14} /> Save changes</button></>} />
      {flash && <p role="status" aria-live="polite" className="rounded-lg bg-accent/10 px-3 py-2 text-[12.5px] font-medium text-accent">{flash}</p>}
      {Object.keys(errors).length > 0 && <ul role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{Object.values(errors).map((m) => <li key={m}>{m}</li>)}</ul>}

      <Card id="ch-h" title="Channels" description="Connections to the services Support will use. No credentials are requested or stored in this demo.">
        <div className="grid gap-3 md:grid-cols-2">
          {data?.channels.map((c) => (
            <div key={c.kind} className="rounded-lg border border-border p-3.5">
              <div className="mb-1.5 flex items-center gap-2">{c.kind === "email" ? <Mail size={16} className="text-sky-600" /> : <MessageCircle size={16} className="text-emerald-600" />}<p className="text-[14px] font-semibold">{c.label}</p><StatusBadge label={c.connected ? "Connected" : "Not connected"} tone={c.connected ? "green" : "slate"} dot className="ml-auto" /></div>
              <p className="text-[12.5px] text-muted">{c.detail}</p>
              <button type="button" disabled title="Available once the integration is built" className="mt-3 cursor-not-allowed rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold opacity-50">Connect (coming later)</button>
            </div>
          ))}
        </div>
      </Card>

      <Card id="cv-h" title="Conversations">
        <Row title="Default priority" hint="Applied to new conversations."><select aria-label="Default priority" value={s.defaultPriority} onChange={(e) => set("defaultPriority", e.target.value as SupportSettings["defaultPriority"])} className={`${control} w-40 border-border`}>{PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></Row>
        <Row title="Default assignment" hint="Who new conversations go to."><select aria-label="Default assignment" value={s.defaultAssignment} onChange={(e) => set("defaultAssignment", e.target.value as SupportSettings["defaultAssignment"])} className={`${control} w-48 border-border`}><option value="unassigned">Leave unassigned</option><option value="rules">Use assignment rules</option></select></Row>
        <Row title="Auto-close resolved-looking conversations" hint="Close conversations with no customer reply after a number of days.">
          <div className="flex items-center gap-2">{s.autoCloseDays !== null && <><input aria-label="Days until auto-close" type="number" min={1} max={90} value={s.autoCloseDays} onChange={(e) => set("autoCloseDays", Number(e.target.value))} className={`${control} w-20 border-border text-right`} /><span className="text-[12.5px] text-muted">days</span></>}<Toggle checked={s.autoCloseDays !== null} onChange={(v) => set("autoCloseDays", v ? 7 : null)} label="Auto-close" /></div>
        </Row>
        {s.autoCloseDays !== null && <div className="border-t border-border py-3"><label htmlFor="ac-msg" className="mb-1.5 block text-[12px] font-semibold text-muted">Message sent when closing (demo: not sent)</label><textarea id="ac-msg" rows={2} value={s.autoCloseMessage} onChange={(e) => set("autoCloseMessage", e.target.value)} className={`${control} resize-y border-border`} /></div>}
        <div className="border-t border-border pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[13px] font-semibold">Business hours</p><select aria-label="Time zone" value={s.timezone} onChange={(e) => set("timezone", e.target.value)} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <TableScroll label="Business hours"><table className="w-full min-w-[420px] text-[13px]"><tbody className="divide-y divide-border">{s.businessHours.map((d, i) => (
            <tr key={d.day}><td className="w-28 py-2 font-medium">{d.day}</td><td className="py-2"><Toggle size="sm" checked={d.open} onChange={(v) => set("businessHours", s.businessHours.map((x, n) => (n === i ? { ...x, open: v } : x)))} label={`${d.day} open`} /></td>
              <td className="py-2 text-right">{d.open ? <span className="inline-flex items-center gap-1.5"><input aria-label={`${d.day} opens`} type="time" value={d.from} onChange={(e) => set("businessHours", s.businessHours.map((x, n) => (n === i ? { ...x, from: e.target.value } : x)))} className="rounded-lg border border-border bg-card px-2 py-1 text-[13px]" />–<input aria-label={`${d.day} closes`} type="time" value={d.to} onChange={(e) => set("businessHours", s.businessHours.map((x, n) => (n === i ? { ...x, to: e.target.value } : x)))} className="rounded-lg border border-border bg-card px-2 py-1 text-[13px]" /></span> : <span className="text-muted">Closed</span>}</td></tr>))}</tbody></table></TableScroll>
        </div>
      </Card>

      <Card id="tm-h" title="Team" description="Who can do what in Support. Permissions come from the platform roles; this page doesn't change them.">
        <TableScroll label="Role permissions"><table className="w-full min-w-[480px] text-left text-[12.5px]"><thead><tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted"><th className="py-2 font-semibold">Role</th><th className="py-2 font-semibold">Reply</th><th className="py-2 font-semibold">Assign</th><th className="py-2 font-semibold">Templates</th><th className="py-2 font-semibold">Settings</th></tr></thead>
          <tbody className="divide-y divide-border">{[["Support lead", true, true, true, true], ["Support agent", true, false, false, false], ["Billing specialist", true, false, true, false]].map(([r, ...caps]) => <tr key={String(r)}><td className="py-2 font-medium">{String(r)}</td>{caps.map((c, i) => <td key={i} className="py-2">{c ? <Check size={14} className="text-emerald-600" aria-label="Allowed" /> : <X size={14} className="text-muted" aria-label="Not allowed" />}</td>)}</tr>)}</tbody></table></TableScroll>
        <p className="mt-2 text-[12px] text-muted">Routing preferences are on <Link href="/support/team" className="font-semibold text-accent hover:underline">Team &amp; Assignments</Link>.</p>
      </Card>

      <Card id="nt-h" title="Notifications">
        <Row title="New message notifications" hint="Tell the assigned agent when a customer replies."><Toggle checked={s.notifyNewMessage} onChange={(v) => set("notifyNewMessage", v)} label="New message notifications" /></Row>
        <Row title="Unassigned conversation alerts" hint="Alert the support lead when nobody owns a conversation."><Toggle checked={s.notifyUnassigned} onChange={(v) => set("notifyUnassigned", v)} label="Unassigned alerts" /></Row>
        <Row title="Email digest"><select aria-label="Email digest" value={s.notifyEmailDigest} onChange={(e) => set("notifyEmailDigest", e.target.value as SupportSettings["notifyEmailDigest"])} className={`${control} w-36 border-border`}><option value="off">Off</option><option value="hourly">Hourly</option><option value="daily">Daily</option></select></Row>
        <p className="mt-1 text-[11.5px] text-muted">Preferences only: no notifications are sent in this demo.</p>
      </Card>

      <Card id="tp-h" title="Templates & replies">
        <div className="grid gap-3 md:grid-cols-2">
          <div><label htmlFor="sig-e" className="mb-1.5 block text-[12px] font-semibold text-muted">Default email signature</label><textarea id="sig-e" rows={4} value={s.signatureEmail} onChange={(e) => set("signatureEmail", e.target.value)} className={`${control} resize-y border-border`} /></div>
          <div><label htmlFor="sig-w" className="mb-1.5 block text-[12px] font-semibold text-muted">Default WhatsApp signature</label><textarea id="sig-w" rows={4} value={s.signatureWhatsApp} onChange={(e) => set("signatureWhatsApp", e.target.value)} className={`${control} resize-y border-border`} /></div>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">You can use {"{{support_agent}}"} in signatures.</p>

        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold">Quick replies</p><button type="button" onClick={() => { setQr({ label: "", text: "" }); setQrErr(""); }} className="flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"><Plus size={13} /> Add quick reply</button></div>
          {qr && (
            <div className="mb-3 space-y-2 rounded-lg border border-border bg-surface/60 p-3">
              <input aria-label="Quick reply label" value={qr.label} onChange={(e) => setQr({ ...qr, label: e.target.value })} placeholder="Label (e.g. Greeting)" className={`${control} border-border`} />
              <textarea aria-label="Quick reply text" rows={2} value={qr.text} onChange={(e) => setQr({ ...qr, text: e.target.value })} placeholder="Reply text" className={`${control} resize-y border-border`} />
              {qrErr && <p role="alert" className="text-[12px] text-red-600">{qrErr}</p>}
              <div className="flex gap-2"><button type="button" onClick={saveQr} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">{qr.id ? "Update" : "Add"}</button><button type="button" onClick={() => setQr(null)} className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted hover:text-foreground">Cancel</button></div>
            </div>
          )}
          <ul className="divide-y divide-border">{data?.quickReplies.map((q) => (
            <li key={q.id} className="flex items-start gap-2 py-2.5"><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{q.label}</p><p className="text-[12px] text-muted">{q.text}</p></div>
              <button type="button" aria-label={`Edit ${q.label}`} onClick={() => { setQr(q); setQrErr(""); }} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"><Pencil size={14} /></button>
              <button type="button" aria-label={`Delete ${q.label}`} onClick={() => setDelQr(q)} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={14} /></button></li>))}</ul>
        </div>
        <p className="mt-4 text-[12.5px] text-muted">Message templates: <Link href="/support/email-templates" className="font-semibold text-accent hover:underline">Email templates</Link> · <Link href="/support/whatsapp-templates" className="font-semibold text-accent hover:underline">WhatsApp templates</Link></p>
      </Card>
      <ConfirmationDialog open={!!delQr} title="Delete this quick reply?" message={`“${delQr?.label}” will no longer appear in the reply composer.`} confirmLabel="Delete" onConfirm={() => { if (delQr) actions.deleteQuickReply(delQr.id); setDelQr(null); }} onCancel={() => setDelQr(null)} />
    </div>
  );
}

export default function SupportSettingsPage() {
  const { data, loading } = useSupport();
  const [flash, setFlash] = useState("");   // lives here so it survives the form re-initialising after a save
  if (loading || !data) return <div className="h-64 animate-pulse rounded-xl bg-surface/60" aria-busy="true" />;
  // Keyed by the stored settings so the form re-initialises after "Reset demo data" (and after Save, when it already matches).
  return <SettingsForm key={JSON.stringify(data.settings)} initial={data.settings} flash={flash} setFlash={setFlash} />;
}
