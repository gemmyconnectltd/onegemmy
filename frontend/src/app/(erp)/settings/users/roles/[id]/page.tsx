"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Back, ModuleUsePill, Pill, PermissionMatrix } from "@/components/users/AccessParts";
import { useAssignRolePermissions, useDeleteCompanyRole, useRoleAccess, useUpdateRole } from "@/lib/api/hooks";
import type { RoleAccess } from "@/lib/api/access";
import { moduleUse } from "@/lib/accessView";
import { useAuth } from "@/lib/auth";

const errorText = (e: unknown, fallback: string) => (e as { detail?: string })?.detail ?? (e as Error)?.message ?? fallback;

export default function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useRoleAccess(id);
  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <div className="py-12 text-center"><p role="alert" className="text-sm text-red-600">This role couldn&apos;t be found or you don&apos;t have access.</p><Link href="/settings/users/roles" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Back to roles</Link></div>;
  return <RoleEditor data={query.data} />;
}

function RoleEditor({ data }: { data: RoleAccess }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("roles:update");
  const { role, groups, modules } = data;
  const save = useAssignRolePermissions();
  const update = useUpdateRole();
  const remove = useDeleteCompanyRole();
  const { confirm, dialog } = useConfirmDialog();
  // The permissions currently granted, and the draft edits on top of them (id -> granted).
  const stored = useMemo(() => new Map(groups.flatMap((g) => g.resources.flatMap((r) => Object.values(r.actions).map((c) => [c.id, c.granted] as const)))), [groups]);
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const isOn = (id: string, granted: boolean) => (id in edits ? edits[id] : granted);
  const dirty = Object.entries(edits).some(([id, on]) => stored.get(id) !== on);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [details, setDetails] = useState({ name: role.name, description: role.description ?? "" });
  const detailsDirty = details.name.trim() !== role.name || details.description.trim() !== (role.description ?? "");

  const toggle = (id: string, on: boolean) => setEdits((cur) => ({ ...cur, [id]: on }));
  const savePermissions = async () => {
    setMessage(null);
    const ids = [...stored.keys()].filter((id) => isOn(id, stored.get(id) ?? false));
    try { await save.mutateAsync({ id: role.id, permissions: ids }); setEdits({}); setMessage({ ok: true, text: "Permissions saved. They apply on each person's next action." }); }
    catch (e: unknown) { setMessage({ ok: false, text: errorText(e, "Couldn't save. Your changes are still here.") }); }
  };
  const saveDetails = async () => {
    setMessage(null);
    try { await update.mutateAsync({ id: role.id, data: { name: details.name.trim(), description: details.description.trim() || null } }); setMessage({ ok: true, text: "Role details saved." }); }
    catch (e: unknown) { setMessage({ ok: false, text: errorText(e, "Couldn't save the role details.") }); }
  };
  const del = () => confirm({
    title: `Delete ${role.name}?`, message: "The role is removed. Nobody holds it, so no one's access changes.", confirmLabel: "Delete role", danger: true,
    onConfirm: () => void remove.mutateAsync(role.id).then(() => router.replace("/settings/users/roles")).catch((e: unknown) => setMessage({ ok: false, text: errorText(e, "Couldn't delete this role.") })),
  });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Back href="/settings/users/roles">Roles &amp; Permissions</Back>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-[22px] font-bold tracking-tight text-foreground">{role.name}</h1><Pill tone={role.built_in ? "slate" : "green"}>{role.built_in ? "Built in" : "Custom"}</Pill></div>
        <p className="mt-0.5 text-sm text-muted">{role.users} {role.users === 1 ? "person holds" : "people hold"} this role · {role.permissions} permissions</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">Details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint={role.built_in ? "Built-in roles keep their name." : undefined}><Input value={details.name} disabled={!canEdit || role.built_in} onChange={(e) => setDetails({ ...details, name: e.target.value })} /></Field>
          <Field label="Description"><Input value={details.description} disabled={!canEdit} onChange={(e) => setDetails({ ...details, description: e.target.value })} /></Field>
        </div>
        {canEdit && <div className="mt-3 flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" disabled={!detailsDirty || !details.name.trim() || update.isPending} onClick={() => void saveDetails()}>Save details</Button>
          {!role.built_in && role.users === 0 && <Button variant="outline" size="sm" onClick={del} disabled={remove.isPending}>Delete role</Button>}
          {!role.built_in && role.users > 0 && <span className="text-[12px] text-muted">Move its {role.users} {role.users === 1 ? "person" : "people"} to another role before deleting it.</span>}</div>}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">What this role can do today</h2>
        <p className="mt-0.5 text-[12px] text-muted">The permissions below are stored on the role. This is what they add up to once your plan and module switches are applied.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{modules.map((m) => <li key={m.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{m.name}</span><span title={moduleUse(m).reason}><ModuleUsePill module={m} /></span></li>)}</ul>
      </section>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-foreground">Permissions</h2>
        {!canEdit && <p className="text-[12px] text-muted">You can see this role but need permission to change it.</p>}
        <PermissionMatrix groups={groups} onToggle={canEdit ? toggle : undefined} isOn={isOn} />
      </div>

      {canEdit && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void savePermissions()} disabled={!dirty || save.isPending}>{save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />} Save permissions</Button>
            {dirty && <Button variant="ghost" onClick={() => setEdits({})}>Discard</Button>}
            {message?.ok && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600"><CheckCircle2 size={13} /> {message.text}</span>}
            {message && !message.ok && <span role="alert" className="text-[12px] font-medium text-red-600">{message.text}</span>}
            {!message && dirty && <span className="text-[12px] text-muted">Unsaved changes</span>}
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
