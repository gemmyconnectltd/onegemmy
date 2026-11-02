"use client";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useRemoveTeamUser, useTeamUsers } from "@/lib/api/hooks";
import TeamUserEditor from "./TeamUserEditor";
import InviteBusinessUser from "./InviteBusinessUser";
import { TeamChoice } from "./TeamFields";

export default function UserFeatureAccess({tenantId,onInvite}:{tenantId:string;onInvite?:()=>void}) {
  const [page,setPage]=useState(1),[selected,setSelected]=useState("");const [search,setSearch]=useState(""),[status,setStatus]=useState(""),[role,setRole]=useState("");const [invite,setInvite]=useState(false);
  const users=useTeamUsers(tenantId,page,useDeferredValue(search),status,role);
  const bulk=useBulkSelection((users.data?.items||[]).filter(u=>!u.is_superuser).map(u=>u.id));
  const remove=useRemoveTeamUser();const {confirm,dialog}=useConfirmDialog();const [bulkBusy,setBulkBusy]=useState(false);const [bulkMessage,setBulkMessage]=useState("");
  return <section className="min-w-0 space-y-4">{dialog}<div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="pesaa-section-title">Users, permissions & access</h2><p className="text-sm text-muted">Invite staff and manage roles, individual permissions, feature switches, branches and account status.</p></div><Button onClick={()=>onInvite?onInvite():setInvite(true)}>Invite user</Button></div>
    <div className="grid items-start gap-3 md:grid-cols-3"><Input aria-label="Search business users" placeholder="Search name or email" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);bulk.clear();}}/><Select aria-label="Filter user status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);bulk.clear();}}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></Select><TeamChoice tenantId={tenantId} kind="roles" label="Filter role" value={role} optional onChange={v=>{setRole(v);setPage(1);bulk.clear();}}/></div>
    {bulk.count>0&&<BulkActionBar count={bulk.count} label="user" deleting={bulkBusy} onClear={bulk.clear} onDelete={()=>confirm({title:"Remove selected users?",message:`Remove ${bulk.count} selected accounts? Their access will end immediately.`,danger:true,confirmLabel:"Remove",onConfirm:async()=>{setBulkBusy(true);const results=await Promise.allSettled([...bulk.selected].map(userId=>remove.mutateAsync({tenantId,userId})));setBulkMessage(`${results.filter(r=>r.status==="fulfilled").length} removed; ${results.filter(r=>r.status==="rejected").length} could not be removed.`);bulk.clear();setBulkBusy(false);}})}/>}{bulkMessage&&<p role="status" className="text-sm text-muted">{bulkMessage}</p>}
    {users.isLoading?<PageLoader variant="compact"/>:users.isError?<p role="alert">Could not load users. <Button variant="outline" onClick={()=>void users.refetch()}>Retry</Button></p>:<><TableScroll label="Business users"><table className="w-full min-w-[620px] text-sm"><thead><tr><th><input type="checkbox" aria-label="Select users on this page" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th><th className="text-left">User</th><th className="text-left">Role</th><th className="text-left">Status</th><th className="text-left">Last sign-in</th><th><span className="sr-only">Manage user</span></th></tr></thead><tbody>{users.data?.items.map(u=><tr key={u.id}><td>{!u.is_superuser&&<input type="checkbox" aria-label={`Select ${u.full_name}`} checked={bulk.selected.has(u.id)} onChange={()=>bulk.toggle(u.id)}/>}</td><td><p className="font-semibold">{u.full_name}</p><p className="text-xs text-muted">{u.email}</p></td><td>{u.is_superuser?"Owner":u.role}</td><td>{u.is_active?"Active":"Inactive"}</td><td>{u.last_login?new Date(u.last_login).toLocaleString():"Never"}</td><td><Button variant="outline" onClick={()=>setSelected(u.id)} aria-label={`Manage ${u.full_name}`}>Manage user</Button></td></tr>)}{users.data?.items.length===0&&<tr><td colSpan={6}>No matching users.</td></tr>}</tbody></table></TableScroll><div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={page===1||users.isFetching} onClick={()=>{setPage(page-1);bulk.clear();}}>Previous</Button><span className="text-sm text-muted">Page {page} · {users.data?.total||0} users</span><Button variant="outline" disabled={users.isFetching||page*20>=(users.data?.total||0)} onClick={()=>{setPage(page+1);bulk.clear();}}>Next</Button></div></>}
    <Drawer open={!!selected} onClose={()=>setSelected("")} title="Manage business user" size="xl">{selected&&<TeamUserEditor key={`${tenantId}:${selected}`} tenantId={tenantId} userId={selected} onClose={()=>setSelected("")}/>}</Drawer><InviteBusinessUser tenantId={tenantId} open={invite} onClose={()=>setInvite(false)}/>
  </section>;
}
