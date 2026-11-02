"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { useInviteTeamUser } from "@/lib/api/hooks";
import { TeamBranches, TeamChoice } from "./TeamFields";

export default function InviteBusinessUser({tenantId,open,onClose}:{tenantId:string;open:boolean;onClose:()=>void}) {
  return <Drawer open={open} onClose={onClose} title="Invite business user" description="Choose their role, department and authorized branches." size="xl">{open&&<InviteForm tenantId={tenantId} onClose={onClose}/>}</Drawer>;
}
function InviteForm({tenantId,onClose}:{tenantId:string;onClose:()=>void}) {
  const invite=useInviteTeamUser();const [name,setName]=useState("");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");const [role,setRole]=useState("");const [department,setDepartment]=useState("");const [branches,setBranches]=useState<string[]|null>(null);
  if(invite.isSuccess)return <div className="space-y-4 p-4"><p role="status" className="text-sm text-accent">User created. Sign-in instructions were requested by email.</p><p className="text-sm text-muted">If they need a new sign-in link, open their account and use Send recovery link.</p><Button onClick={onClose}>Done</Button></div>;
  return <form className="space-y-4 p-4" onSubmit={e=>{e.preventDefault();invite.mutate({tenantId,data:{full_name:name.trim(),email:email.trim(),phone:phone.trim()||undefined,role_id:role,department_id:department||null,branch_ids:branches,branch_id:branches?.[0]||null}});}}>
    <Field label="Full name" required><Input required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Email" required><Input required type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Phone"><Input type="tel" maxLength={50} value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
    <TeamChoice tenantId={tenantId} kind="roles" label="Role" value={role} onChange={setRole}/><p className="text-xs text-muted">Select Member or an appropriate job role. Extra permissions can be configured after invitation.</p><TeamChoice tenantId={tenantId} kind="departments" label="Department" optional value={department} onChange={setDepartment}/><TeamBranches tenantId={tenantId} value={branches} onChange={setBranches}/>
    {invite.isError&&<p role="alert" className="text-sm text-red-600">{invite.error.message}</p>}<p className="text-xs text-muted">A temporary credential is generated on the server and emailed. Passwords are never displayed here.</p><div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!role||!name.trim()||invite.isPending}>{invite.isPending?"Inviting…":"Invite user"}</Button></div>
  </form>;
}
