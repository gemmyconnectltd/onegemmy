"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toggle } from "@/components/ui/Toggle";
import { Avatar } from "@/components/support/parts";
import { useAuth } from "@/lib/auth";
import { useAddMember, useTeam, useUpdateMember } from "@/lib/support/hooks";

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", support_manager: "Support Manager", support_agent: "Support Agent" };

function AddMember({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useAddMember();
  const [f, setF] = useState({ full_name: "", email: "", role: "support_agent" });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temp_password: string } | null>(null);
  const valid = f.full_name.trim() && /^\S+@\S+\.\S+$/.test(f.email);
  const close = () => { setCreated(null); setError(null); setF({ full_name: "", email: "", role: "support_agent" }); onClose(); };
  const submit = async () => {
    setError(null);
    try { const res = await add.mutateAsync({ ...f, full_name: f.full_name.trim(), email: f.email.trim() }); setCreated({ email: res.data.email, temp_password: res.data.temp_password }); }
    catch (e) { setError((e as { detail?: string })?.detail ?? "Couldn't add the team member."); }
  };
  return (
    <Drawer open={open} onClose={close} side="center" size="md" title={created ? "Team member added" : "Add team member"}
      footer={created ? <div className="flex justify-end"><Button variant="primary" onClick={close}>Done</Button></div>
        : <div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancel</Button><Button variant="primary" onClick={() => void submit()} disabled={!valid || add.isPending}>{add.isPending ? "Adding…" : "Add member"}</Button></div>}>
      <div className="space-y-3 px-5 py-4">
        {created ? (
          <>
            <p className="text-sm">Give <strong>{created.email}</strong> this temporary password. It is shown only once — ask them to change it after signing in.</p>
            <div className="flex items-center gap-2 rounded-lg bg-surface p-3"><code className="min-w-0 flex-1 break-all text-[13px]">{created.temp_password}</code>
              <Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(created.temp_password)} aria-label="Copy password"><Copy size={13} /></Button></div>
          </>
        ) : (
          <>
            <Field label="Full name" required><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Role" hint="Agents work their own and unassigned conversations. Managers see everything and assign work."><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="support_agent">Support Agent</option><option value="support_manager">Support Manager</option></Select></Field>
            {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
          </>
        )}
      </div>
    </Drawer>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const team = useTeam();
  const update = useUpdateMember();
  const [show, setShow] = useState(false);
  const isSuper = user?.role === "superadmin";
  const rows = team.data ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="Team" subtitle="Support agents, their roles and current workload."
        actions={isSuper ? <Button variant="primary" onClick={() => setShow(true)}><Plus size={14} /> Add member</Button> : undefined} />
      {!isSuper && <Notice tone="blue">Only a Super Admin can add team members or change roles. Assign work from the Inbox or Tickets.</Notice>}
      {team.isError ? <ErrorState message="Couldn't load the team." onRetry={() => void team.refetch()} /> : (
        <DataCard label="Support team">
          {team.isLoading ? <p className="p-6 text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No team members yet" description="Add support agents so conversations can be assigned." /> : (
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead><tr className="border-b border-border bg-surface/40">{["Member", "Role", "Open conversations", "Open tickets", "Active"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-surface/40">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={m.full_name} /><div className="min-w-0"><p className="truncate font-semibold text-foreground">{m.full_name}</p><p className="truncate text-[11px] text-muted">{m.email}</p></div></div></td>
                    <td className="px-4 py-3">{isSuper && m.role !== "superadmin"
                      ? <Select aria-label={`Role of ${m.full_name}`} value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value })} className="w-auto! py-1 text-[12.5px]"><option value="support_agent">Support Agent</option><option value="support_manager">Support Manager</option></Select>
                      : <Badge tone={m.role === "superadmin" ? "violet" : "slate"}>{ROLE_LABEL[m.role] ?? m.role}</Badge>}</td>
                    <td className="px-4 py-3 font-semibold">{m.open_conversations}</td>
                    <td className="px-4 py-3 font-semibold">{m.open_tickets}</td>
                    <td className="px-4 py-3">{isSuper && m.role !== "superadmin" ? <Toggle size="sm" label={`${m.is_active ? "Deactivate" : "Activate"} ${m.full_name}`} checked={m.is_active} onChange={(v) => update.mutate({ id: m.id, is_active: v })} /> : <Badge tone={m.is_active ? "green" : "slate"}>{m.is_active ? "Active" : "Inactive"}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>
      )}
      {update.isError && <p role="alert" className="text-[12px] text-red-600">{(update.error as { detail?: string })?.detail ?? "Couldn't update the team member."}</p>}
      <AddMember open={show} onClose={() => setShow(false)} />
    </div>
  );
}
