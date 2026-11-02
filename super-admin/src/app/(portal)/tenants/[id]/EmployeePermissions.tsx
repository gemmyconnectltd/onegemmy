"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSaveTeamPermissions, useTeamPermissions, useSaveTeamRolePermissions, useTeamRolePermissions } from "@/lib/api/hooks";
import type { TeamPermissions } from "@/lib/api/admin";

export default function EmployeePermissions({tenantId,userId}:{tenantId:string;userId:string}) {
  const q=useTeamPermissions(tenantId,userId);
  if(q.isLoading)return <PageLoader variant="compact"/>;
  if(q.isError||!q.data)return <p role="alert">Could not load permissions. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>;
  return <PermissionEditor key={`${q.data.role_id}:${q.data.permission_ids.join(',')}`} tenantId={tenantId} userId={userId} data={q.data}/>;
}
function PermissionEditor({tenantId,userId,data,roleId}:{tenantId:string;userId:string;data:TeamPermissions;roleId?:string}) {
  const [selected,setSelected]=useState(new Set(data.permission_ids));const [scope,setScope]=useState<"user"|"role">(roleId?"role":"user");const [search,setSearch]=useState("");const userSave=useSaveTeamPermissions();const roleSave=useSaveTeamRolePermissions();const save=roleId?roleSave:userSave;const {confirm,dialog}=useConfirmDialog();
  const baseline=new Set(data.baseline);const dirty=selected.size!==data.permission_ids.length||data.permission_ids.some(id=>!selected.has(id));
  if(roleId&&["admin","owner"].includes((data.role_name||"").toLowerCase()))return <p className="text-sm text-muted">This administrative role retains full access. Use individual user permissions to customize an administrator.</p>;
  if(data.is_owner)return <p className="text-sm text-muted">The business owner retains full access. Owner permissions cannot be reduced here.</p>;
  const submit=()=>confirm({title:scope==="user"?"Save individual permissions?":"Change shared role permissions?",message:scope==="user"?"This gives the selected user a dedicated role. Other users keep their existing permissions.":`This updates ${data.role_name} for all ${data.role_users} users holding it.`,confirmLabel:"Save permissions",onConfirm:()=>{if(roleId)roleSave.mutate({tenantId,roleId,data:{permission_ids:[...selected],expected_permission_ids:data.permission_ids}});else userSave.mutate({tenantId,userId,data:{permission_ids:[...selected],expected_role_id:data.role_id,expected_permission_ids:data.permission_ids,scope}});}});
  return <div className="space-y-4">{dialog}<div className="rounded-xl border border-border bg-surface p-3 text-sm"><p className="font-semibold">Role: {data.role_name||"None"} · {data.role_users} user{data.role_users===1?"":"s"}</p><p className="mt-1 text-muted">Feature switches decide which modules they can open. Permissions control actions such as recording expenses, deleting records and approvals.</p><p className="mt-1 text-xs text-muted">Default operational View/Edit and POS checkout remain available when the feature is enabled. Use feature switches to remove that access. Cells marked Default show this baseline.</p></div>
    {!roleId&&<label className="block text-sm font-medium">Apply changes to<Select aria-label="Permission change scope" value={scope} onChange={e=>setScope(e.target.value as "user"|"role")}><option value="user">This user only (dedicated role)</option><option value="role" disabled={!data.role_id||["admin","owner"].includes((data.role_name||"").toLowerCase())}>Everyone with this role</option></Select></label>}
    <Input aria-label="Search permissions" placeholder="Search a module or resource, e.g. expenses" value={search} onChange={e=>setSearch(e.target.value)}/>
    {data.groups.map(group=>{const rows=group.resources.filter(r=>`${group.name} ${r.label} ${r.resource}`.toLowerCase().includes(search.toLowerCase()));if(!rows.length)return null;return <section key={group.module} className="overflow-hidden rounded-xl border border-border"><h3 className="pesaa-card-title bg-surface px-3 py-2">{group.name}</h3><TableScroll label={`${group.name} permissions`}><table className="w-full min-w-[560px] text-sm"><thead><tr><th className="text-left">Resource</th>{["View","Create","Edit","Delete","Approve"].map(a=><th key={a}>{a}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.resource}><th className="text-left font-medium">{row.label}</th>{["read","create","update","delete","approve"].map(action=>{const cell=row.actions[action];if(!cell)return <td key={action} className="text-center text-muted">—</td>;const automatic=baseline.has(cell.name);return <td key={action} className="text-center"><label className="inline-flex min-h-11 items-center justify-center gap-1"><input type="checkbox" aria-label={`${row.label}: ${cell.label}`} checked={automatic||selected.has(cell.id)} disabled={automatic||save.isPending} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(cell.id);else next.delete(cell.id);return next;})}/>{automatic&&<span className="text-xs text-muted">Default</span>}</label></td>;})}</tr>)}</tbody></table></TableScroll></section>;})}
    {save.isError&&<p role="alert" className="text-sm text-red-600">{save.error.message}</p>}{save.isSuccess&&<p role="status" className="text-sm text-accent">Permissions saved.</p>}<div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-card py-3"><Button disabled={!dirty||save.isPending} onClick={submit}>{save.isPending?"Saving…":"Save permissions"}</Button><Button variant="outline" disabled={!dirty||save.isPending} onClick={()=>setSelected(new Set(data.permission_ids))}>Discard</Button></div>
  </div>;
}


export function RolePermissionManager({tenantId,roleId}:{tenantId:string;roleId:string}) {
  const q=useTeamRolePermissions(tenantId,roleId);
  if(q.isLoading)return <PageLoader variant="compact"/>;
  if(q.isError||!q.data)return <p role="alert">Could not load role permissions. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>;
  return <PermissionEditor key={`${roleId}:${q.data.permission_ids.join(',')}`} tenantId={tenantId} userId="" roleId={roleId} data={q.data}/>;
}
