"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, type Tone } from "@/components/ui/Badge";
import { ErrorState, Notice } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toggle } from "@/components/ui/Toggle";
import { SaveBar, SettingRow } from "@/components/admin/settingsParts";
import { supportApi, type SupportSettings } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEmailSync, useSaveSupportSettings, useSupportChannels, useSupportSettings, useWhatsappConnect, useWhatsappDisconnect } from "@/lib/support/hooks";
import { fmtDateTime } from "@/lib/date";

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]] as const;
const ZONES = ["Africa/Kigali", "Africa/Nairobi", "Africa/Accra", "Africa/Lagos", "Africa/Johannesburg", "Europe/London", "UTC"];
const WA_TONE: Record<string, Tone> = { connected: "green", awaiting_qr: "amber", connecting: "blue", disconnected: "slate", error: "red", not_configured: "slate" };
const WA_LABEL: Record<string, string> = { connected: "Connected", awaiting_qr: "Scan QR code", connecting: "Connecting…", disconnected: "Disconnected", error: "Error", not_configured: "Not set up on the server" };

function Card({ title, icon: Icon, children, action }: { title: string; icon: typeof Mail; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5"><h2 className="flex items-center gap-2 text-sm font-bold text-foreground"><Icon size={15} className="text-accent" />{title}</h2>{action}</div>
      <div className="px-4 py-1 sm:px-5">{children}</div>
    </section>
  );
}

// A data: URL straight from the gateway — next/image can't optimise it, and shouldn't.
// eslint-disable-next-line @next/next/no-img-element
const QrImage = ({ src }: { src: string }) => <img src={src} alt="WhatsApp QR code" className="h-44 w-44 rounded-lg border border-border bg-white p-1" />;

function WhatsAppCard({ canEdit }: { canEdit: boolean }) {
  const ch = useSupportChannels({ refetchInterval: 15000 });
  const connect = useWhatsappConnect();
  const disconnect = useWhatsappDisconnect();
  const [error, setError] = useState<string | null>(null);
  const wa = ch.data?.whatsapp;
  const awaiting = wa?.status === "awaiting_qr" || wa?.status === "connecting";
  const qr = useQuery({ queryKey: ["support", "wa-qr"], queryFn: () => supportApi.whatsappQr().then((r) => r.data), enabled: !!awaiting && canEdit, refetchInterval: 4000, retry: false });

  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError((e as { detail?: string })?.detail ?? "That didn't work."); } };
  return (
    <Card title="WhatsApp" icon={MessageCircle} action={wa && <Badge tone={WA_TONE[wa.status] ?? "slate"}>{WA_LABEL[wa.status] ?? wa.status}</Badge>}>
      {ch.isLoading || !wa ? <p className="py-4 text-sm text-muted">Loading…</p> : (
        <>
          <SettingRow label="Connected number"><span className="text-sm font-semibold">{wa.number ? `+${wa.number}` : "—"}</span></SettingRow>
          <SettingRow label="Last connected"><span className="text-sm">{wa.last_connected_at ? fmtDateTime(wa.last_connected_at) : "Never"}</span></SettingRow>
          {wa.last_error && <SettingRow label="Last error"><span className="text-[12.5px] text-red-600">{wa.last_error}</span></SettingRow>}
          {!wa.configured ? (
            <div className="py-3"><Notice tone="blue">WhatsApp runs through OpenWA, which isn&apos;t configured on the server yet. Ask the person who manages the deployment to set it up (see <code>deploy/openwa/README.md</code>).</Notice></div>
          ) : (
            <div className="space-y-3 py-3">
              {awaiting && canEdit && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-start sm:gap-5">
                  {qr.data?.qr ? <QrImage src={qr.data.qr} /> : <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-surface"><Loader2 className="animate-spin text-muted" /></div>}
                  <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted"><li>Open WhatsApp on the support phone</li><li>Settings → Linked devices → Link a device</li><li>Scan this code. It refreshes automatically.</li></ol>
                </div>
              )}
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {wa.status !== "connected" && <Button variant="primary" disabled={connect.isPending} onClick={() => void run(() => connect.mutateAsync())}>{connect.isPending && <Loader2 size={13} className="animate-spin" />}{wa.status === "awaiting_qr" ? "Restart connection" : "Connect WhatsApp"}</Button>}
                  {wa.status !== "disconnected" && <Button variant="outline" disabled={disconnect.isPending} onClick={() => void run(() => disconnect.mutateAsync())}>Disconnect</Button>}
                </div>
              ) : <p className="text-[12px] text-muted">Only a Super Admin can connect or disconnect WhatsApp.</p>}
              {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function EmailCard({ canSync }: { canSync: boolean }) {
  const ch = useSupportChannels();
  const sync = useEmailSync();
  const [msg, setMsg] = useState<string | null>(null);
  const em = ch.data?.email;
  return (
    <Card title="Email" icon={Mail} action={em && <Badge tone={em.inbound_configured ? (em.status === "error" ? "red" : "green") : "slate"}>{em.inbound_configured ? (em.status === "error" ? "Error" : "Receiving") : "Sending only"}</Badge>}>
      {!em ? <p className="py-4 text-sm text-muted">Loading…</p> : (
        <>
          <SettingRow label="Sending replies" hint="Uses Pesaa's existing SMTP email account."><Badge tone={em.outbound_configured ? "green" : "red"}>{em.outbound_configured ? "Configured" : "Not configured"}</Badge></SettingRow>
          <SettingRow label="Receiving mail" hint="Needs a Microsoft Graph connection to the support mailbox."><Badge tone={em.inbound_configured ? "green" : "slate"}>{em.inbound_configured ? "Configured" : "Not configured"}</Badge></SettingRow>
          <SettingRow label="Support mailbox"><span className="text-sm font-semibold">{em.mailbox ?? "—"}</span></SettingRow>
          {em.last_connected_at && <SettingRow label="Last synced"><span className="text-sm">{fmtDateTime(em.last_connected_at)}</span></SettingRow>}
          {em.last_error && <SettingRow label="Last error"><span className="text-[12.5px] text-red-600">{em.last_error}</span></SettingRow>}
          {!em.inbound_configured && <div className="py-3"><Notice tone="blue">Customer emails can&apos;t be received until the Microsoft Graph credentials for the support mailbox are added to the server. Replies to existing conversations still send.</Notice></div>}
          {em.inbound_configured && canSync && (
            <div className="flex items-center gap-3 py-3">
              <Button variant="outline" disabled={sync.isPending} onClick={() => { setMsg(null); sync.mutate(undefined, { onSuccess: (r) => setMsg(`${r.data.imported} new message${r.data.imported === 1 ? "" : "s"} imported`), onError: (e) => setMsg((e as { detail?: string })?.detail ?? "Sync failed") }); }}>{sync.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now</Button>
              {msg && <span role="status" className="text-[12px] text-muted">{msg}</span>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function AutomationForm({ initial, canEdit }: { initial: SupportSettings; canEdit: boolean }) {
  const save = useSaveSupportSettings();
  const [s, setS] = useState<SupportSettings>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = (p: Partial<SupportSettings>) => { setS((x) => ({ ...x, ...p })); setSaved(false); };
  const day = (k: string) => s.hours[k] ?? null;
  const invalid = Object.values(s.hours).some((h) => h && h.open >= h.close);

  const submit = async () => {
    setError(null);
    try { await save.mutateAsync(s); setSaved(true); } catch (e) { setError((e as { detail?: string })?.detail ?? "Couldn't save."); }
  };
  return (
    <Card title="Business hours & automation" icon={RefreshCw}>
      <SettingRow label="Time zone"><Select disabled={!canEdit} aria-label="Time zone" value={s.timezone} onChange={(e) => patch({ timezone: e.target.value })} className="w-full sm:w-56">{[...new Set([s.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</Select></SettingRow>
      <SettingRow label="Business hours" hint="Leave every day closed to treat support as always open." stack>
        <div className="space-y-1.5">
          {DAYS.map(([k, label]) => (
            <div key={k} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-[13px]">{label}</span>
              <Toggle size="sm" label={`${label} open`} disabled={!canEdit} checked={!!day(k)} onChange={(v) => patch({ hours: { ...s.hours, [k]: v ? { open: "08:00", close: "17:00" } : null } })} />
              {day(k) ? <div className="flex items-center gap-2"><Input type="time" aria-label={`${label} opens`} disabled={!canEdit} value={day(k)!.open} onChange={(e) => patch({ hours: { ...s.hours, [k]: { ...day(k)!, open: e.target.value } } })} className="w-28" /><span className="text-muted">–</span><Input type="time" aria-label={`${label} closes`} disabled={!canEdit} value={day(k)!.close} onChange={(e) => patch({ hours: { ...s.hours, [k]: { ...day(k)!, close: e.target.value } } })} className="w-28" /></div> : <span className="text-[12px] text-muted">Closed</span>}
            </div>
          ))}
        </div>
      </SettingRow>
      <SettingRow label="Acknowledge new conversations" hint="One automatic reply to the first message of a new conversation. Never to automated senders, and at most once a day per customer."><Toggle size="sm" label="Automatic acknowledgement" disabled={!canEdit} checked={s.auto_ack_enabled} onChange={(v) => patch({ auto_ack_enabled: v })} /></SettingRow>
      {s.auto_ack_enabled && (<>
        <SettingRow label="During business hours" stack><Textarea rows={2} disabled={!canEdit} value={s.auto_ack_text} maxLength={1000} onChange={(e) => patch({ auto_ack_text: e.target.value })} /></SettingRow>
        <SettingRow label="Outside business hours" stack><Textarea rows={2} disabled={!canEdit} value={s.after_hours_text} maxLength={1000} onChange={(e) => patch({ after_hours_text: e.target.value })} /></SettingRow>
      </>)}
      <SettingRow label="Keep resolved conversations for" hint="Older resolved conversations are deleted automatically. Open ones are never deleted."><Select disabled={!canEdit} aria-label="Retention" value={s.retention_days ?? ""} onChange={(e) => patch({ retention_days: e.target.value ? Number(e.target.value) : null })} className="w-full sm:w-44"><option value="">Forever</option><option value={90}>90 days</option><option value={180}>6 months</option><option value={365}>1 year</option><option value={730}>2 years</option></Select></SettingRow>
      {canEdit ? <div className="-mx-4 sm:-mx-5"><SaveBar dirty={dirty} invalid={invalid} saving={save.isPending} saved={saved} error={error} onSave={() => void submit()} /></div> : <p className="py-3 text-[12px] text-muted">Only a Super Admin can change these settings.</p>}
    </Card>
  );
}

export default function SupportSettingsPage() {
  const { user } = useAuth();
  const settings = useSupportSettings();
  const isSuper = user?.role === "superadmin";
  const isManager = isSuper || user?.role === "support_manager";
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Channels, business hours and automation for Customer Support." />
      <WhatsAppCard canEdit={isSuper} />
      <EmailCard canSync={isManager} />
      {settings.isError ? <ErrorState message="Couldn't load automation settings." onRetry={() => void settings.refetch()} />
        : settings.data ? <AutomationForm initial={settings.data} canEdit={isSuper} /> : <p className="text-sm text-muted">Loading…</p>}
    </div>
  );
}
