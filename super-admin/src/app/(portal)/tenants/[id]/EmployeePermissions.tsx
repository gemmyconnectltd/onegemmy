"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSaveTeamPermissions, useTeamPermissions, useSaveTeamRolePermissions, useTeamRolePermissions } from "@/lib/api/hooks";
import type { TeamPermissions } from "@/lib/api/admin";

const STANDARD:[string,string][]=[["read","View"],["create","Create"],["update","Edit"],["delete","Delete"],["approve","Approve"]];
const extraActions=(row:TeamPermissions["groups"][number]["resources"][number])=>Object.entries(row.actions).filter(([a])=>!STANDARD.some(([s])=>s===a));

type Row=TeamPermissions["groups"][number]["resources"][number];
type Cell=Row["actions"][string];

/** One action as a labelled chip: green when allowed, locked "Default" when staff always have it. Every box names itself. */
export function ActionChip({label,checked,locked,disabled,onChange}:{label:string;checked:boolean;locked?:boolean;disabled?:boolean;onChange:(on:boolean)=>void}) {
  const off=disabled&&!locked;
  return <label title={locked?"Always on for staff while the module is switched on":undefined} className={`inline-flex min-h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${checked?"border-accent/40 bg-accent/10 text-accent":"border-border bg-card text-muted hover:border-accent/40 hover:text-foreground"} ${locked?"cursor-default opacity-80":""} ${off?"cursor-not-allowed opacity-60":""}`}>
    <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--primary)]" checked={checked} disabled={locked||disabled} onChange={e=>onChange(e.target.checked)}/>
    {label}{locked&&<span className="font-normal opacity-80">· Default</span>}
  </label>;
}

/** One permission row, the same everywhere: what it is on top, its actions as one wrapping line of chips underneath. Shared by every module, the till and role editing. */
export function ActionRow({title,help,children}:{title:string;help?:string;children:ReactNode}) {
  return <li className="space-y-2 px-4 py-3">
    <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{title}</p>{help&&<p className="text-xs text-muted">{help}</p>}</div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </li>;
}

/** A module's resources, each with its actions as chips (View, Create, Edit, Delete, Approve, then any special ones). */
export function PermissionTable({label,rows,selected,baseline,disabled,onToggle}:{label:string;rows:Row[];selected:Set<string>;baseline:Set<string>;disabled?:boolean;onToggle:(id:string,on:boolean)=>void}) {
  const chip=(row:Row,cell:Cell,text:string)=>{const locked=baseline.has(cell.name);return <ActionChip key={cell.id} label={text} checked={locked||selected.has(cell.id)} locked={locked} disabled={disabled} onChange={on=>onToggle(cell.id,on)}/>;};
  return <ul aria-label={`${label} permissions`} className="divide-y divide-border">{rows.map(row=><ActionRow key={row.resource} title={row.label}>
    {STANDARD.map(([action,name])=>{const cell=row.actions[action];return cell?chip(row,cell,cell.label!==name&&cell.label?cell.label:name):null;})}
    {extraActions(row).map(([,cell])=>chip(row,cell,cell.label))}
  </ActionRow>)}</ul>;
}

export default function EmployeePermissions({tenantId,userId}:{tenantId:string;userId:string}) {
  const q=useTeamPermissions(tenantId,userId);
  if(q.isLoading)return <PageLoader variant="compact"/>;
  if(q.isError||!q.data)return <p role="alert">Could not load permissions. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>;
  return <PermissionEditor key={`${q.data.role_id}:${q.data.permission_ids.join(',')}`} tenantId={tenantId} userId={userId} data={q.data}/>;
}
function PermissionEditor({tenantId,userId,data,roleId}:{tenantId:string;userId:string;data:TeamPermissions;roleId?:string}) {
  const [selected,setSelected]=useState(new Set(data.permission_ids));const [scope,setScope]=useState<"user"|"role">(roleId?"role":"user");const [search,setSearch]=useState("");const userSave=useSaveTeamPermissions();const roleSave=useSaveTeamRolePermissions();const save=roleId?roleSave:userSave;const {confirm,dialog}=useConfirmDialog();
  const baseline=new Set(data.baseline);
  const toggle=(id:string,on:boolean)=>setSelected(old=>{const next=new Set(old);if(on)next.add(id);else next.delete(id);return next;});const dirty=selected.size!==data.permission_ids.length||data.permission_ids.some(id=>!selected.has(id));
  if(roleId&&["admin","owner"].includes((data.role_name||"").toLowerCase()))return <p className="text-sm text-muted">This administrative role retains full access. Use individual user permissions to customize an administrator.</p>;
  if(data.is_owner)return <p className="text-sm text-muted">The business owner retains full access. Owner permissions cannot be reduced here.</p>;
  const submit=()=>confirm({title:scope==="user"?"Save individual permissions?":"Change shared role permissions?",message:scope==="user"?"This gives the selected user a dedicated role. Other users keep their existing permissions.":`This updates ${data.role_name} for all ${data.role_users} users holding it.`,confirmLabel:"Save permissions",onConfirm:()=>{if(roleId)roleSave.mutate({tenantId,roleId,data:{permission_ids:[...selected],expected_permission_ids:data.permission_ids}});else userSave.mutate({tenantId,userId,data:{permission_ids:[...selected],expected_role_id:data.role_id,expected_permission_ids:data.permission_ids,scope}});}});
  return <div className="space-y-4">{dialog}<div className="rounded-xl border border-border bg-card p-3 text-sm"><p className="font-semibold">Role: {data.role_name||"None"} · {data.role_users} user{data.role_users===1?"":"s"}</p><p className="mt-1 text-muted">Feature switches decide which modules they can open. Permissions control actions such as recording expenses, deleting records and approvals.</p><p className="mt-1 text-xs text-muted">Default operational View/Edit and POS checkout remain available when the feature is enabled. Use feature switches to remove that access. Cells marked Default show this baseline.</p></div>
    {!roleId&&<label className="block text-sm font-medium">Apply changes to<Select aria-label="Permission change scope" value={scope} onChange={e=>setScope(e.target.value as "user"|"role")}><option value="user">This user only (dedicated role)</option><option value="role" disabled={!data.role_id||["admin","owner"].includes((data.role_name||"").toLowerCase())}>Everyone with this role</option></Select></label>}
    <Input aria-label="Search permissions" placeholder="Search a module or resource, e.g. expenses" value={search} onChange={e=>setSearch(e.target.value)}/>
    {data.groups.map(group=>{const rows=group.resources.filter(r=>`${group.name} ${r.label} ${r.resource}`.toLowerCase().includes(search.toLowerCase()));if(!rows.length)return null;return <section key={group.module} className="overflow-hidden rounded-xl border border-border bg-card"><h3 className="pesaa-card-title bg-surface px-3 py-2">{group.name}</h3><PermissionTable label={group.name} rows={rows} selected={selected} baseline={baseline} disabled={save.isPending} onToggle={toggle}/></section>;})}
    {save.isError&&<p role="alert" className="text-sm text-red-600">{save.error.message}</p>}{save.isSuccess&&<p role="status" className="text-sm text-accent">Permissions saved.</p>}<div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-card py-3"><Button disabled={!dirty||save.isPending} onClick={submit}>{save.isPending?"Saving…":"Save permissions"}</Button><Button variant="outline" disabled={!dirty||save.isPending} onClick={()=>setSelected(new Set(data.permission_ids))}>Discard</Button></div>
  </div>;
}


export function RolePermissionManager({tenantId,roleId}:{tenantId:string;roleId:string}) {
  const q=useTeamRolePermissions(tenantId,roleId);
  if(q.isLoading)return <PageLoader variant="compact"/>;
  if(q.isError||!q.data)return <p role="alert">Could not load role permissions. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>;
  return <PermissionEditor key={`${roleId}:${q.data.permission_ids.join(',')}`} tenantId={tenantId} userId="" roleId={roleId} data={q.data}/>;
}
