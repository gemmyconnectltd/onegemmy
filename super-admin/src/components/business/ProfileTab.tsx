"use client";
import type { ReactNode } from "react";
import { Check, Circle, CircleSlash, Pause } from "lucide-react";
import type { AdminTenant, AdminTenantRecord, AdminUser } from "@/lib/api/admin";
import { Button } from "@/components/ui/Button";
import { fmtDateTime, fmtRelative } from "@/lib/date";
import { Card } from "@/app/(portal)/tenants/[id]/TenantPanels";
import { OperationsPanel } from "@/app/(portal)/tenants/[id]/TenantOperations";
import { cn } from "@/lib/utils";

const TYPE: Record<string, string> = { sole: "Sole Proprietorship", partnership: "Partnership", llc: "Limited Liability (LLC)", unregistered: "Not Registered" };
const CONTACT: Record<string, string> = { email: "Email", phone: "Phone call", whatsapp: "WhatsApp", all: "All (WhatsApp, phone call and email)" };

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v);
  return shown.length === 0 ? <p className="text-[12.5px] text-muted">Nothing recorded yet.</p> : (
    <dl className="grid gap-x-6 sm:grid-cols-2">{shown.map(([k, v]) => <div key={k} className="min-w-0 border-b border-border/60 py-2 text-[13px]"><dt className="text-[11.5px] text-muted">{k}</dt><dd className="break-words font-semibold">{v}</dd></div>)}</dl>
  );
}

function Lifecycle({ tenant }: { tenant: AdminTenant }) {
  const pending = tenant.subscription_status === "pending";
  const closed = !!tenant.archived_at;
  const steps: { label: string; at?: string | null; state: "done" | "current" | "off" | "blocked" }[] = [
    { label: "Registered", at: tenant.created_at, state: "done" },
    { label: "Verified", at: pending ? null : tenant.reactivated_at ?? tenant.created_at, state: pending ? "current" : "done" },
    { label: "Active", state: tenant.is_active && !closed ? "current" : "off" },
    { label: "Suspended", at: tenant.suspended_at, state: !tenant.is_active && !pending && !closed ? "current" : "off" },
    { label: "Closed", at: tenant.archived_at, state: closed ? "current" : "off" },
  ];
  return (
    <ol className="grid grid-cols-5 gap-1 text-center" aria-label="Business lifecycle">
      {steps.map((s) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="min-w-0">
          <span className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-white", s.state === "done" ? "border-accent bg-accent" : s.state === "current" ? (s.label === "Suspended" || s.label === "Closed" ? "border-red-500 bg-red-500" : "border-accent bg-accent ring-2 ring-accent/30") : "border-border bg-surface text-muted")}>
            {s.state === "done" ? <Check size={13} /> : s.label === "Suspended" ? <Pause size={12} /> : s.label === "Closed" ? <CircleSlash size={12} /> : <Circle size={9} />}</span>
          <p className={cn("mt-1 truncate text-[11px] font-semibold", s.state === "current" ? "text-foreground" : "text-muted")}>{s.label}</p>
          <p className="truncate text-[10px] text-muted">{s.at ? new Date(s.at).toLocaleDateString() : s.state === "current" ? "Current" : "—"}</p>
        </li>))}
    </ol>
  );
}

/** What the business is, how it is set up, where it is in its life, and the things a platform administrator can do to it. */
export function ProfileTab({ tenant, users, controls, events, onEdit }: { tenant: AdminTenant; users: AdminUser[]; controls: ReactNode; events: AdminTenantRecord[]; onEdit: () => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="pesaa-card-title text-lg">Business Profile</h2><p className="mt-0.5 text-[12.5px] text-muted">The business identity, contacts and operational settings.</p></div>
          <Button variant="outline" size="sm" onClick={onEdit}>Edit profile</Button></div>
        <Card title="General Information"><Facts rows={[["Business name", tenant.name], ["Identifier", tenant.slug], ["Industry", tenant.industry], ["Business category", tenant.business_category], ["Business type", TYPE[tenant.business_type ?? ""] ?? tenant.business_type],
          ["Employees", tenant.employee_count], ["Currency", tenant.currency], ["Registered", tenant.created_at ? fmtDateTime(tenant.created_at) : null]]} /></Card>
        <Card title="Contact & Address"><Facts rows={[["Primary phone", tenant.phone], ["Website", tenant.website && <a key="w" href={tenant.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{tenant.website}</a>],
          ["Address", tenant.address], ["City", tenant.city], ["Country", tenant.country], ["Business location", tenant.business_location], ["Prefers to be contacted by", CONTACT[tenant.preferred_contact ?? ""]], ["Heard about us", tenant.heard_about]]} /></Card>
        <Card title="Operational Settings"><p className="mb-3 text-[12px] text-muted">Changes apply to the business immediately and are recorded in its audit trail.</p>{controls}</Card>
        <section aria-labelledby="actions" className="space-y-3"><h3 id="actions" className="pesaa-card-title">Business Actions</h3><OperationsPanel tenant={tenant} users={users} /></section>
      </div>
      <div className="min-w-0 space-y-4 xl:self-start">
        <Card title="Business Lifecycle"><Lifecycle tenant={tenant} />
          {tenant.suspension_reason && !tenant.is_active && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-400"><strong>Suspended:</strong> {tenant.suspension_reason}</p>}</Card>
        <Card title="Change History">
          {events.length === 0 ? <p className="text-[12.5px] text-muted">No changes recorded yet.</p> : (
            <ul className="divide-y divide-border">{events.slice(0, 8).map((e) => <li key={e.id} className="py-2 text-[12.5px]"><p className="truncate font-semibold">{e.title ?? e.reference ?? "Change"}</p><p className="text-[11px] text-muted">{[e.counterparty, e.recorded_at ? fmtRelative(e.recorded_at) : null].filter(Boolean).join(" · ")}</p></li>)}</ul>)}
        </Card>
      </div>
    </div>
  );
}
