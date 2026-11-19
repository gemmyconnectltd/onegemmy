"use client";
import { useDeferredValue, useState, type FormEvent } from "react";
import { Copy, KeyRound, Pencil, Plus, RotateCcw, Search, Shield, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Field, FormFooter, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import type { AdminRole } from "@/lib/api/admin";
import { useCreateRole, useDeleteRole, useRestoreDefaultRoles, useTenantRoles, useUpdateRole } from "@/lib/api/hooks";
import { RolePermissionManager } from "./EmployeePermissions";

type Editing = { mode: "add" } | { mode: "copy"; from: AdminRole } | { mode: "edit"; role: AdminRole };
type Kind = "all" | "custom" | "standard";
const failed = (cause: unknown, fallback: string) => (cause as { detail?: string })?.detail ?? fallback;

/** Create, view, rename, duplicate, set permissions for and delete a business's roles. Standard roles keep their names and can't be
 *  deleted; a role still held by someone can't be deleted either (the server enforces both and says why). */
export function RolesManager({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const q = useTenantRoles(tenantId);
  const remove = useDeleteRole();
  const restore = useRestoreDefaultRoles();
  const { confirm, dialog } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<AdminRole | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const term = useDeferredValue(search).trim().toLowerCase();

  const roles = q.data?.items ?? [];
  const shown = roles
    .filter((r) => kind === "all" || (kind === "standard") === !!r.built_in)
    .filter((r) => !term || `${r.name} ${r.description ?? ""} ${r.department ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => Number(!!a.built_in) - Number(!!b.built_in) || a.name.localeCompare(b.name));
  const customCount = roles.filter((r) => !r.built_in).length;

  const askDelete = (role: AdminRole) => confirm({
    title: "Delete role?",
    message: `Delete "${role.name}" from ${tenantName}? This can't be undone.`,
    confirmLabel: "Delete role",
    danger: true,
    onConfirm: () => remove.mutate({ tenantId, roleId: role.id }, {
      onSuccess: () => setNotice({ ok: true, text: `Role "${role.name}" deleted.` }),
      onError: (cause) => setNotice({ ok: false, text: failed(cause, "The role couldn't be deleted.") }),
    }),
  });
  const restoreDefaults = () => restore.mutate({ tenantId }, {
    onSuccess: (res) => setNotice({ ok: true, text: res.message ?? "Standard roles restored." }),
    onError: (cause) => setNotice({ ok: false, text: failed(cause, "Standard roles couldn't be restored.") }),
  });

  if (q.isLoading) return <PageLoader variant="compact" />;
  if (q.isError) return <ErrorState message="This business's roles couldn't be loaded." onRetry={() => void q.refetch()} />;

  return (
    <section className="space-y-3" aria-label="Roles">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="pesaa-section-title">Roles</h2>
          <p className="text-sm text-muted">{roles.length} roles · {customCount} custom. A role decides what the people who hold it can see and do.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={restore.isPending} onClick={restoreDefaults} title="Add any standard role this business is missing. Existing roles are not changed.">
            <RotateCcw size={14} aria-hidden /> {restore.isPending ? "Restoring…" : "Restore standard roles"}
          </Button>
          <Button size="sm" onClick={() => setEditing({ mode: "add" })}><Plus size={14} aria-hidden /> New role</Button>
        </div>
      </div>

      {notice && <p role={notice.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? "pesaa-badge-success" : "pesaa-badge-error"}`}>{notice.text}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search roles" className="pl-8" placeholder="Search roles" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Role type" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="all">All roles</option>
          <option value="custom">Custom roles</option>
          <option value="standard">Standard roles</option>
        </Select>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Shield} title={roles.length ? "No roles match" : "No roles yet"}
          description={roles.length ? "Try another search or type." : "Restore the standard roles or create one."}
          action={roles.length ? <Button variant="outline" size="sm" onClick={() => { setSearch(""); setKind("all"); }}>Clear filters</Button> : undefined} />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <TableScroll label="Roles">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Department</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-right font-semibold">People</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Permissions</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{r.name}</p>
                      {r.description && <p className="max-w-xs truncate text-xs text-muted" title={r.description}>{r.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.department ?? "—"}</td>
                    <td className="px-4 py-3">{r.built_in ? <Badge tone="slate">Standard</Badge> : <Badge tone="green">Custom</Badge>}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.user_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.permission_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" aria-label={`Permissions for ${r.name}`} onClick={() => setPermissionsFor(r)}><KeyRound size={13} aria-hidden /><span className="hidden xl:inline">Permissions</span></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} title={r.built_in ? "Edit description (standard role names can't change)" : "Edit"} onClick={() => setEditing({ mode: "edit", role: r })}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${r.name}`} title="Duplicate with the same permissions" onClick={() => setEditing({ mode: "copy", from: r })}><Copy size={14} /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`}
                          title={r.built_in ? "Standard roles can't be deleted" : r.user_count ? "Move the people who hold this role first" : "Delete"}
                          disabled={!!r.built_in || !!r.user_count || (remove.isPending && remove.variables?.roleId === r.id)} onClick={() => askDelete(r)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      {editing && <RoleEditor tenantId={tenantId} tenantName={tenantName} editing={editing} roles={roles} onClose={() => setEditing(null)}
        onSaved={(text, created) => { setEditing(null); setNotice({ ok: true, text }); if (created) setPermissionsFor(created); }} />}
      <Drawer open={!!permissionsFor} onClose={() => setPermissionsFor(null)} title={permissionsFor ? `Permissions · ${permissionsFor.name}` : "Permissions"}
        description="Changes apply to everyone who holds this role." size="xl">
        <div className="p-4">{permissionsFor && <RolePermissionManager tenantId={tenantId} roleId={permissionsFor.id} />}</div>
      </Drawer>
    </section>
  );
}

function RoleEditor({ tenantId, tenantName, editing, roles, onClose, onSaved }: {
  tenantId: string; tenantName: string; editing: Editing; roles: AdminRole[]; onClose: () => void; onSaved: (message: string, created?: AdminRole) => void;
}) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const role = editing.mode === "edit" ? editing.role : null;
  const [name, setName] = useState(role?.name ?? (editing.mode === "copy" ? `${editing.from.name} (copy)` : ""));
  const [description, setDescription] = useState(role?.description ?? (editing.mode === "copy" ? editing.from.description ?? "" : ""));
  const [copyFrom, setCopyFrom] = useState(editing.mode === "copy" ? editing.from.id : "");
  const [error, setError] = useState("");
  const busy = create.isPending || update.isPending;
  const lockedName = !!role?.built_in;
  const clash = roles.some((r) => r.id !== role?.id && r.name.trim().toLowerCase() === name.trim().toLowerCase());
  const problem = !name.trim() ? "Enter a role name." : name.trim().length > 100 ? "Keep the name under 100 characters." : clash ? "This business already has a role with that name." : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem && !lockedName) return;
    setError("");
    try {
      if (role) {
        await update.mutateAsync({ tenantId, roleId: role.id, data: { ...(lockedName ? {} : { name: name.trim() }), description: description.trim() || null } });
        onSaved(`Role "${lockedName ? role.name : name.trim()}" updated.`);
      } else {
        const res = await create.mutateAsync({ tenantId, data: { name: name.trim(), description: description.trim() || undefined, copy_from_role_id: copyFrom || null } });
        onSaved(copyFrom ? `Role "${name.trim()}" created with the same permissions.` : `Role "${name.trim()}" created. Now choose its permissions.`, copyFrom ? undefined : res.data);
      }
    } catch (cause) { setError(failed(cause, "The role couldn't be saved.")); }
  };

  const title = role ? `Edit role · ${role.name}` : editing.mode === "copy" ? `Duplicate role · ${editing.from.name}` : "New role";
  return (
    <Drawer open onClose={() => !busy && onClose()} title={title} description={tenantName} dirty={!busy && (!!name || !!description) && !role}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Name" required hint={lockedName ? "Standard role names can't be changed. Duplicate it to make your own version." : problem || undefined}>
          <Input required maxLength={100} disabled={lockedName} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night shift cashier" aria-invalid={!lockedName && !!problem && !!name} />
        </Field>
        <Field label="Description" hint="What this role is for, shown to the business when they assign it.">
          <Textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {!role && (
          <Field label="Start with permissions from" hint="Copies every permission of that role. Leave empty to start with none and choose them next.">
            <Select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">No permissions (choose next)</option>
              {[...roles].sort((a, b) => a.name.localeCompare(b.name)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <FormFooter submitLabel={busy ? "Saving…" : role ? "Save changes" : "Create role"} onCancel={onClose} disabled={busy || (!lockedName && !!problem)} />
      </form>
    </Drawer>
  );
}
