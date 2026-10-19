"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useCompanyRoles, useRolePermissions, usePermissionCatalog, useCreateCompanyRole, useAssignRolePermissions } from "@/lib/api/hooks";
import type { CompanyRole } from "@/lib/api/companyRoles";

function PermissionEditor({ role }: { role: CompanyRole }) {
  const assigned = useRolePermissions(role.id);
  const [page, setPage] = useState(1);
  const catalog = usePermissionCatalog(page);
  const save = useAssignRolePermissions();
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const selected = new Set(assigned.data?.map((permission) => permission.id));
  for (const [id, checked] of Object.entries(changes)) { if (checked) selected.add(id); else selected.delete(id); }
  async function submit() {
    setMessage("");
    try { await save.mutateAsync({ id: role.id, permissions: [...selected] }); setChanges({}); setMessage("Permissions saved. Backend checks apply immediately; users may need to sign in again to refresh navigation."); }
    catch { setMessage("Could not save permissions. Your changes are still here."); }
  }
  if (assigned.isLoading || catalog.isLoading) return <PageLoader variant="compact" />;
  if (assigned.error || catalog.error) return <p role="alert">Could not load permissions.</p>;
  return <div className="space-y-4"><h3 className="font-semibold">{role.name}</h3><p className="text-sm text-muted">Stock viewing and stock changes are separate permissions. Manufacturing permissions are independent of sales.</p>
    <div className="grid gap-2 sm:grid-cols-2">{catalog.data?.items.map((permission) => <label key={permission.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"><input type="checkbox" checked={selected.has(permission.id)} onChange={(event) => setChanges({ ...changes, [permission.id]: event.target.checked })} />{permission.name}</label>)}</div>
    <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous permissions</Button><Button variant="outline" disabled={page * 100 >= (catalog.data?.total ?? 0)} onClick={() => setPage(page + 1)}>More permissions</Button></div>
    <Button disabled={save.isPending || !Object.keys(changes).length} onClick={() => void submit()}>Save permissions</Button>{message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
export function RoleManager({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(1);
  const roles = useCompanyRoles(page);
  const create = useCreateCompanyRole();
  const [name, setName] = useState("");
  const [role, setRole] = useState<CompanyRole | null>(null);
  const [error, setError] = useState("");
  async function add() {
    setError("");
    try { const response = await create.mutateAsync(name.trim()); setRole(response.data); setName(""); }
    catch { setError("Could not create the role. Use a unique name."); }
  }
  return <Drawer open onClose={onClose} title="Manage roles and permissions" size="xl"><div className="space-y-4 p-5">
    <Field label="New role name"><div className="flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} /><Button disabled={!name.trim() || create.isPending} onClick={() => void add()}>Create role</Button></div></Field>
    {error && <p role="alert">{error}</p>}
    {roles.isLoading ? <PageLoader variant="compact" /> : <div className="flex flex-wrap gap-2">{roles.data?.items.map((item) => <Button key={item.id} variant={role?.id === item.id ? "default" : "outline"} onClick={() => setRole(item)}>{item.name}</Button>)}</div>}
    <div className="flex gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous roles</Button><Button variant="outline" disabled={page * 25 >= (roles.data?.total ?? 0)} onClick={() => setPage(page + 1)}>More roles</Button></div>
    {role && <PermissionEditor key={role.id} role={role} />}
  </div></Drawer>;
}
