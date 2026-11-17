"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { useInviteTeamUser } from "@/lib/api/hooks";
import { TeamBranches, TeamChoice } from "./TeamFields";
import { SignInDetails, makePassword, passwordProblem } from "./SignInDetails";

export default function InviteBusinessUser({tenantId,open,onClose}:{tenantId:string;open:boolean;onClose:()=>void}) {
  return <Drawer open={open} onClose={onClose} title="Invite business user" description="Choose their role, department and authorized branches." size="xl">{open&&<InviteForm tenantId={tenantId} onClose={onClose}/>}</Drawer>;
}
function InviteForm({tenantId,onClose}:{tenantId:string;onClose:()=>void}) {
  const invite=useInviteTeamUser();const [name,setName]=useState("");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");const [role,setRole]=useState("");const [department,setDepartment]=useState("");const [branches,setBranches]=useState<string[]|null>(null);const [password,setPassword]=useState("");const [sent,setSent]=useState("");
  const problem=passwordProblem(password);const emailed=invite.data?.data?.email_sent!==false;
  if(invite.isSuccess)return <div className="space-y-4 p-4"><p role="status" className="text-sm text-accent">User created.</p>{sent?<SignInDetails email={email.trim()} password={sent} emailed={emailed}/>:<p className="text-sm text-muted">{emailed?"A password was emailed to them.":"The email could not be sent. Open their account and use Set a default password to give them one directly."}</p>}<Button variant="outline" onClick={onClose}>Done</Button></div>;
  return <form className="space-y-4 p-4" onSubmit={e=>{e.preventDefault();if(problem)return;setSent(password);invite.mutate({tenantId,data:{full_name:name.trim(),email:email.trim(),phone:phone.trim()||undefined,role_id:role,department_id:department||null,branch_ids:branches,branch_id:branches?.[0]||null,password:password||null}});}}>
    <Field label="Full name" required><Input required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Email" required><Input required type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Phone"><Input type="tel" maxLength={50} value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
    <Field label="Password" hint={problem??"Optional. Set one to give them directly (at least 6 characters). Leave empty and Pesaa creates one and emails it."}><div className="flex gap-2"><Input type="text" autoComplete="new-password" spellCheck={false} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Leave empty to email one"/><Button type="button" variant="outline" onClick={()=>setPassword(makePassword())}>Generate</Button></div></Field>
    <TeamChoice tenantId={tenantId} kind="roles" label="Role" value={role} onChange={setRole}/><p className="text-xs text-muted">Select Member or an appropriate job role. Extra permissions can be configured after invitation.</p><TeamChoice tenantId={tenantId} kind="departments" label="Department" optional value={department} onChange={setDepartment}/><TeamBranches tenantId={tenantId} value={branches} onChange={setBranches}/>
    {invite.isError&&<p role="alert" className="text-sm text-red-600">{invite.error.message}</p>}<p className="text-xs text-muted">The password is emailed to them too. If you set one, you see it once after inviting, to copy.</p><div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!role||!name.trim()||!!problem||invite.isPending}>{invite.isPending?"Inviting…":"Invite user"}</Button></div>
  </form>;
}
