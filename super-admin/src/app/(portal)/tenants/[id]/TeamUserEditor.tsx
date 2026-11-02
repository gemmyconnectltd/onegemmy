"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useTeamUser, useUpdateTeamUser, useSetTeamStatus, useRemoveTeamUser, useResetUserPassword, useTeamActivity } from "@/lib/api/hooks";
import type { TeamUser } from "@/lib/api/admin";
import EmployeePermissions from "./EmployeePermissions";
import EmployeeFeatureSwitches from "./EmployeeFeatureSwitches";
import { TeamBranches, TeamChoice } from "./TeamFields";

export default function TeamUserEditor({tenantId,userId,onClose}:{tenantId:string;userId:string;onClose:()=>void}) {
  const [tab,setTab]=useState("profile");const q=useTeamUser(tenantId,userId);
  if(q.isLoading)return <PageLoader variant="compact"/>;
  if(q.isError||!q.data)return <p role="alert" className="p-4">Could not load this user. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>;
  const user=q.data;
  return <div className="min-w-0 space-y-4 p-4"><div><h2 className="pesaa-card-title">{user.full_name}</h2><p className="break-all text-sm text-muted">{user.email}</p><p className="text-xs text-muted">{user.is_superuser?"Owner":user.role} · {user.is_active?"Active":"Inactive"}</p></div><nav aria-label="User management sections" className="flex overflow-x-auto border-b border-border">{[["profile","Profile & branches"],["permissions","Permissions"],["features","Features"],["activity","Activity"]].map(([key,label])=><button type="button" key={key} aria-pressed={tab===key} onClick={()=>setTab(key)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab===key?"border-accent text-accent":"border-transparent text-muted"}`}>{label}</button>)}</nav>
    {tab==="profile"&&<ProfileForm key={`${user.id}:${user.updated_at}`} tenantId={tenantId} user={user} onClose={onClose}/>}
    {tab==="permissions"&&<EmployeePermissions tenantId={tenantId} userId={userId}/>}
    {tab==="features"&&<EmployeeFeatureSwitches tenantId={tenantId} userId={userId}/>}
    {tab==="activity"&&<UserActivity tenantId={tenantId} userId={userId}/>}
  </div>;
}
function ProfileForm({tenantId,user,onClose}:{tenantId:string;user:TeamUser;onClose:()=>void}) {
  const [name,setName]=useState(user.full_name),[phone,setPhone]=useState(user.phone||""),[role,setRole]=useState(user.role_id||""),[dept,setDept]=useState(user.department_id||"");const [branches,setBranches]=useState<string[]|null>(user.branch_ids??(user.branch_id?[user.branch_id]:null));
  const update=useUpdateTeamUser(),status=useSetTeamStatus(),remove=useRemoveTeamUser(),recover=useResetUserPassword();const {confirm,dialog}=useConfirmDialog();
  const busy=update.isPending||status.isPending||remove.isPending||recover.isPending;
  const dirty=name!==user.full_name||phone!==(user.phone||"")||role!==(user.role_id||"")||dept!==(user.department_id||"")||JSON.stringify(branches)!==JSON.stringify(user.branch_ids??(user.branch_id?[user.branch_id]:null));
  return <div className="space-y-4">{dialog}<form className="space-y-4" onSubmit={e=>{e.preventDefault();update.mutate({tenantId,userId:user.id,data:{full_name:name.trim(),phone:phone.trim(),...(user.is_superuser?{}:{role_id:role||undefined}),department_id:dept||null,branch_ids:branches,branch_id:branches?.[0]||null}});}}>
    <Field label="Full name" required><Input required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Phone"><Input type="tel" maxLength={50} value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
    {user.is_superuser?<p className="text-sm text-muted">The business owner retains their role and full access.</p>:<TeamChoice tenantId={tenantId} kind="roles" label="Role" value={role} currentLabel={user.role} onChange={setRole}/>}
    <TeamChoice tenantId={tenantId} kind="departments" label="Department" optional value={dept} onChange={setDept}/><TeamBranches tenantId={tenantId} value={branches} onChange={setBranches}/>
    {update.isError&&<p role="alert" className="text-sm text-red-600">{update.error.message}</p>}<Button type="submit" disabled={!dirty||busy||!name.trim()}>{update.isPending?"Saving…":"Save user"}</Button>
  </form><section className="space-y-3 border-t border-border pt-4"><h3 className="pesaa-card-title">Account actions</h3><p className="text-xs text-muted">Last sign-in: {user.last_login?new Date(user.last_login).toLocaleString():"Never"}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!user.is_active} onClick={()=>confirm({title:"Send recovery link?",message:`Email a time-limited recovery link to ${user.email}.`,confirmLabel:"Send link",onConfirm:()=>recover.mutate({tenantId,userId:user.id})})}>Send recovery link</Button>
    {!user.is_superuser&&<><Button variant="outline" disabled={busy} onClick={()=>confirm({title:user.is_active?"Deactivate user?":"Reactivate user?",message:user.is_active?"They will lose access immediately. Their records and audit history remain.":"Restore sign-in access with their existing role and feature settings.",danger:user.is_active,onConfirm:()=>status.mutate({tenantId,userId:user.id,active:!user.is_active})})}>{user.is_active?"Deactivate":"Reactivate"}</Button><Button variant="destructive" disabled={busy} onClick={()=>confirm({title:"Remove user?",message:"Remove this account from the business. Deactivate instead if you may restore access later.",danger:true,confirmLabel:"Remove user",onConfirm:()=>remove.mutate({tenantId,userId:user.id},{onSuccess:onClose})})}>Remove user</Button></>}
    </div>{recover.isSuccess&&<p role="status" className="text-sm text-accent">Recovery link emailed.</p>}{(status.error||remove.error||recover.error)&&<p role="alert" className="text-sm text-red-600">{(status.error||remove.error||recover.error)?.message}</p>}</section></div>;
}
function UserActivity({tenantId,userId}:{tenantId:string;userId:string}) {
  const [page,setPage]=useState(1);const q=useTeamActivity(tenantId,userId,page);
  if(q.isLoading)return <PageLoader variant="compact"/>;
  if(q.isError)return <p role="alert">Could not load activity. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>;
  return <div className="space-y-3"><h3 className="pesaa-card-title">Account activity</h3><ul className="divide-y divide-border">{q.data?.items.map(e=><li key={e.id} className="py-3"><p className="text-sm">{e.summary}</p><p className="text-xs text-muted">{e.actor_name||"System"} · {e.created_at?new Date(e.created_at).toLocaleString():"—"}</p></li>)}</ul>{!q.data?.items.length&&<p className="text-sm text-muted">No activity recorded.</p>}<div className="flex justify-between"><Button variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</Button><Button variant="outline" disabled={page*20>=(q.data?.total||0)} onClick={()=>setPage(page+1)}>Next</Button></div></div>;
}
