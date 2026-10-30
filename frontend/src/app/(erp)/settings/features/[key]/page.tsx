"use client";

import Link from "next/link";
import { use } from "react";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { Back, Pill } from "@/components/users/AccessParts";
import { useModuleDetail, useMyModules } from "@/lib/api/hooks";
import { STATUS_LABEL } from "@/lib/accessView";
import { moduleHref, unavailableReason } from "@/lib/moduleAvailability";
import { useAuth } from "@/lib/auth";
import type { ModuleStatus } from "@/lib/api";

const TONE: Record<ModuleStatus, "green" | "slate" | "amber" | "red"> = { enabled: "green", available: "slate", not_included: "amber", restricted: "red" };

const Card = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="min-w-0 rounded-xl border border-border bg-card"><header className="border-b border-border px-4 py-3"><h2 className="text-sm font-bold text-foreground">{title}</h2>{hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}</header><div className="p-4">{children}</div></section>
);

export default function ModuleDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { hasPermission } = useAuth();
  const modules = useMyModules();
  const detail = useModuleDetail(key, { enabled: hasPermission("roles:read") });
  if (modules.isLoading) return <PageLoader variant="compact" />;
  const m = modules.data?.modules.find((x) => x.key === key);
  if (!m) return <div className="py-12 text-center"><p role="alert" className="text-sm text-red-600">This module couldn&apos;t be found.</p><Link href="/settings/features" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Back to Features &amp; Modules</Link></div>;
  const open = m.status === "enabled" ? moduleHref(key) : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Back href="/settings/features">Features &amp; Modules</Back>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-[22px] font-bold tracking-tight text-foreground">{m.name}</h1><Pill tone={TONE[m.status]}>{STATUS_LABEL[m.status]}</Pill></div>
        {m.description && <p className="mt-0.5 text-sm text-muted">{m.description}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Overview">
          <p className="text-sm text-foreground">{m.status === "enabled" ? `${m.name} is on. People can use it according to their role.` : unavailableReason(m.name, m.status)}</p>
          <p className="mt-2 text-[12px] text-muted">Your plan: {modules.data?.plan?.name ?? "No plan selected"}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {open && <Link href={open}><Button size="sm">Open {m.name}</Button></Link>}
            <Link href="/settings/features"><Button size="sm" variant="outline">{m.status === "enabled" || m.status === "available" ? "Turn on or off" : "Back to the list"}</Button></Link>
            {m.status === "not_included" && <Link href="/settings/billing"><Button size="sm" variant="secondary">Upgrade plan</Button></Link>}
          </div>
        </Card>
        <Card title="Works together with" hint="Switched on or off together, in this order.">
          {m.needs.length === 0 && m.needed_by.length === 0 ? <p className="text-sm text-muted">It works on its own.</p> : (
            <div className="space-y-3 text-sm">
              {m.needs.length > 0 && <div><p className="text-[12px] font-semibold text-muted">Needs</p><ul className="mt-1 space-y-1">{m.needs.map((n) => <li key={n.key} className="flex items-center gap-2"><Link href={`/settings/features/${n.key}`} className="font-medium hover:text-accent hover:underline">{n.name}</Link><Pill tone={TONE[n.status]}>{STATUS_LABEL[n.status]}</Pill></li>)}</ul></div>}
              {m.needed_by.length > 0 && <div><p className="text-[12px] font-semibold text-muted">Used by</p><ul className="mt-1 space-y-1">{m.needed_by.map((n) => <li key={n.key} className="flex items-center gap-2"><Link href={`/settings/features/${n.key}`} className="font-medium hover:text-accent hover:underline">{n.name}</Link><Pill tone={TONE[n.status]}>{STATUS_LABEL[n.status]}</Pill></li>)}</ul></div>}
            </div>
          )}
        </Card>
      </div>

      {hasPermission("roles:read") && (
        <Card title="Who can use it" hint="Roles with permissions in this module. Turning the module on doesn't give anyone access by itself.">
          {detail.isLoading ? <PageLoader variant="compact" /> : !detail.data ? <p className="text-sm text-muted">Couldn&apos;t load role access.</p> : (
            <>
              <p className="mb-3 text-[12px] text-muted">{detail.data.owners} owner{detail.data.owners === 1 ? "" : "s"} can always use it while it is on.</p>
              {detail.data.roles.length === 0 ? <p className="text-sm text-muted">No role has permissions in this module yet.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className="py-2 pr-3 font-semibold">Role</th><th scope="col" className="py-2 pr-3 font-semibold">Access</th><th scope="col" className="py-2 text-right font-semibold">People</th></tr></thead>
                  <tbody className="divide-y divide-border">{detail.data.roles.map((r) => <tr key={r.id}><td className="py-2 pr-3"><Link href={`/settings/users/roles/${r.id}`} className="font-medium hover:text-accent hover:underline">{r.name}</Link></td><td className="py-2 pr-3 text-[13px] text-muted">{r.can_change ? "View and change" : "View only"}</td><td className="py-2 text-right tabular-nums">{r.users}</td></tr>)}</tbody></table></div>
              )}
            </>
          )}
        </Card>
      )}

      {hasPermission("roles:read") && detail.data && (
        <Card title="History" hint="When this module was turned on or off.">
          {detail.data.history.length === 0 ? <p className="py-4 text-center text-sm text-muted">No changes yet.</p> : <ul className="divide-y divide-border">{detail.data.history.map((h) => <li key={h.id} className="py-2.5"><p className="text-sm text-foreground">{h.summary}</p><p className="text-[12px] text-muted">{h.actor ? `${h.actor} · ` : ""}{h.at ? new Date(h.at).toLocaleString() : ""}</p></li>)}</ul>}
        </Card>
      )}
    </div>
  );
}
