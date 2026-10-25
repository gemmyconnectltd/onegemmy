"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Mail, Phone, UserRound, X } from "lucide-react";
import { marketingApi } from "@/lib/api";
import { errorText, useContactProfile, useMarketingMutation } from "@/lib/marketing/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { ErrorState } from "@/components/ui/EmptyState";
import { CONTACT_STATUS, Flash, when } from "./shared";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="flex justify-between gap-4 py-1.5 text-[13px]"><dt className="text-muted">{label}</dt><dd className="min-w-0 text-right font-medium text-foreground">{children}</dd></div>;
const Block = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
  <section className="border-b border-border px-5 py-4 last:border-0"><h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted"><Icon size={13} aria-hidden />{title}</h3>{children}</section>
);

/** Contact profile: the business, its authorised recipient, communication preferences, tags and message history. */
export function ContactDrawer({ id, onClose, onMessage }: { id: string | null; onClose: () => void; onMessage?: (c: { id: string; name: string }) => void }) {
  const { data, isLoading, isError, refetch } = useContactProfile(id);
  const [tag, setTag] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const edit = useMarketingMutation((d: { tags: string[] }) => marketingApi.editContact(id!, d));
  const action = useMarketingMutation((a: { action: "newsletter_on" | "newsletter_off" | "suppress" | "reactivate"; reason?: string }) => marketingApi.bulk({ ids: [id!], ...a }));
  const c = data?.contact;
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ tone: "ok", text: ok }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } };
  return (
    <Drawer open={!!id} onClose={onClose} side="right" size="xl" title={c ? (c.business_name ?? c.name ?? c.email) : "Contact"} description={c?.email}>
      {isLoading ? <PageLoader variant="compact" /> : isError || !data || !c ? <div className="p-5"><ErrorState message="Could not load this contact." onRetry={() => void refetch()} /></div> : (
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <Badge tone={CONTACT_STATUS[c.status].tone} dot>{CONTACT_STATUS[c.status].label}</Badge>
            <Badge tone={c.eligible ? "green" : "amber"}>{c.eligible ? "Can receive marketing" : "Not eligible for marketing"}</Badge>
            {c.newsletter_subscribed && <Badge tone="blue">Newsletter</Badge>}
            {c.tenant_id && onMessage && c.status === "active" && <Button size="sm" variant="outline" className="ml-auto" onClick={() => onMessage({ id: c.tenant_id!, name: c.business_name ?? c.email })}>Message</Button>}
          </div>
          <Block title="Business" icon={Building2}>
            {data.business ? (
              <dl><Row label="Name"><Link href={`/tenants/${data.business.id}`} className="text-accent hover:underline">{data.business.name}</Link></Row>
                <Row label="Plan"><span className="capitalize">{data.business.plan}</span></Row><Row label="Industry">{data.business.industry ?? "—"}</Row>
                <Row label="Location">{[data.business.city, data.business.country].filter(Boolean).join(", ") || "—"}</Row>
                <Row label="Account">{data.business.is_active ? "Active" : "Suspended"}</Row><Row label="Registered">{when(data.business.created_at)}</Row>
                <Row label="Last used the ERP">{when(c.last_active_at)}</Row></dl>
            ) : <p className="text-[13px] text-muted">An imported contact — not linked to a Pesaa business account{c.business_name ? ` (${c.business_name})` : ""}.</p>}
          </Block>
          <Block title="Authorised recipient" icon={UserRound}>
            <dl><Row label="Name">{c.name ?? "—"}</Row><Row label="Email"><span className="inline-flex items-center gap-1.5"><Mail size={12} aria-hidden />{c.email}</span></Row>
              <Row label="Phone"><span className="inline-flex items-center gap-1.5"><Phone size={12} aria-hidden />{c.phone ?? "—"}</span></Row><Row label="Email check">{c.email_valid ? "Valid" : (c.invalid_reason ?? "Invalid")}</Row></dl>
          </Block>
          <Block title="Communication preferences" icon={Mail}>
            <dl><Row label="Prefers">{c.preferred_contact ?? "—"}</Row>
              <Row label="Marketing consent">{c.consent === "subscribed" ? `Recorded — ${c.consent_source ?? "source not given"} (${when(c.consent_at)})` : "None recorded"}</Row>
              <Row label="Newsletter">{c.newsletter_subscribed ? "Subscribed" : "Not subscribed"}</Row>
              <Row label="Status">{CONTACT_STATUS[c.status].label}{c.status_reason ? ` — ${c.status_reason}` : ""}</Row></dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.status === "active" && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(() => action.mutateAsync({ action: c.newsletter_subscribed ? "newsletter_off" : "newsletter_on" }), c.newsletter_subscribed ? "Removed from the newsletter" : "Subscribed to the newsletter")}>{c.newsletter_subscribed ? "Unsubscribe from newsletter" : "Subscribe to newsletter"}</Button>}
              {c.status === "active" ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(() => action.mutateAsync({ action: "suppress", reason: "Suppressed from the contact profile" }), "Suppressed — no marketing will be sent")}>Suppress</Button>
                : c.email_valid && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(() => action.mutateAsync({ action: "reactivate", reason: "Reactivated from the contact profile" }), "Reactivated")}>Reactivate</Button>}
            </div>
          </Block>
          <Block title="Tags" icon={UserRound}>
            <div className="flex flex-wrap gap-1.5">
              {c.tags.length === 0 && <span className="text-[13px] text-muted">No tags</span>}
              {c.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[12px] font-medium">{t}<button type="button" aria-label={`Remove tag ${t}`} className="text-muted hover:text-foreground" onClick={() => run(() => edit.mutateAsync({ tags: c.tags.filter((x) => x !== t) }), "Tag removed")}><X size={11} /></button></span>)}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = tag.trim(); if (v) run(() => edit.mutateAsync({ tags: [...c.tags, v] }).then(() => setTag("")), "Tag added"); }}>
              <Input aria-label="New tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag" maxLength={40} /><Button type="submit" size="sm" variant="outline" disabled={!tag.trim() || edit.isPending}>Add</Button>
            </form>
          </Block>
          {msg && <div className="px-5 pb-2"><Flash tone={msg.tone}>{msg.text}</Flash></div>}
          <Block title="Message history" icon={Mail}>
            {data.messages.length === 0 && data.supportOutreach.length === 0 ? <p className="text-[13px] text-muted">No marketing messages yet.</p> : (
              <ul className="divide-y divide-border">
                {data.messages.map((m) => <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-[13px]"><span className="min-w-0"><span className="block truncate font-medium">{m.title}</span><span className="text-[11px] text-muted">{m.kind === "automation" ? "Automation" : "Campaign"} · {when(m.sentAt ?? m.queuedAt)}{m.reason ? ` · ${m.reason}` : ""}</span></span>
                  <span className="flex-shrink-0 text-right"><Badge tone={m.status === "sent" ? "green" : m.status === "pending" || m.status === "sending" ? "amber" : m.status === "skipped" ? "slate" : "red"}>{m.status}</Badge>{(m.opens > 0 || m.clicks > 0) && <span className="mt-0.5 block text-[11px] text-muted">{m.opens} opens · {m.clicks} clicks</span>}</span></li>)}
                {data.supportOutreach.map((m) => <li key={m.id} className="py-2 text-[13px]"><span className="font-medium">{m.subject ?? "Support outreach"}</span><span className="block text-[11px] text-muted">Direct message via {m.channel} · {when(m.at)}</span></li>)}
              </ul>
            )}
          </Block>
          <Block title="Activity" icon={UserRound}>
            {data.activity.length === 0 ? <p className="text-[13px] text-muted">No changes recorded.</p> : <ul className="space-y-1.5">{data.activity.map((a, i) => <li key={i} className="text-[12.5px]"><span className="text-muted">{when(a.at)} · {a.by ?? "System"}</span><span className="block">{a.summary}</span></li>)}</ul>}
          </Block>
        </div>
      )}
    </Drawer>
  );
}
