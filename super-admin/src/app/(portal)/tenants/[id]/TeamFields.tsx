"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useTeamOptions } from "@/lib/api/hooks";

export function TeamChoice({tenantId,kind,label,value,onChange,currentLabel,optional=false,disabled=false}:{tenantId:string;kind:"roles"|"departments";label:string;value:string;onChange:(v:string)=>void;currentLabel?:string;optional?:boolean;disabled?:boolean}) {
  const [page,setPage]=useState(1);
  const q=useTeamOptions(tenantId,kind,page);
  const items=q.data?.items || [];
  return <div className="min-w-0 space-y-2"><Field label={label}><Select required={!optional} aria-label={label} value={value} disabled={disabled||q.isLoading} onChange={e=>onChange(e.target.value)}><option value="" disabled={!optional}>{optional?"None":"Choose a role"}</option>{value&&!items.some(i=>i.id===value)&&<option value={value}>{currentLabel||"Current selection"}</option>}{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>{q.isError&&<p role="alert" className="text-sm text-red-600">Could not load {kind}. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>}{(q.data?.total||0)>50&&<div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" aria-label={`Previous ${kind}`} disabled={page===1||q.isFetching} onClick={()=>setPage(page-1)}>Previous</Button><span className="text-xs text-muted">{kind} page {page}</span><Button type="button" variant="outline" size="sm" aria-label={`Next ${kind}`} disabled={page*50>=(q.data?.total||0)||q.isFetching} onClick={()=>setPage(page+1)}>Next</Button></div>}</div>;
}

export function TeamBranches({tenantId,value,onChange,disabled=false}:{tenantId:string;value:string[]|null;onChange:(v:string[]|null)=>void;disabled?:boolean}) {
  const id=useId();const [page,setPage]=useState(1);const q=useTeamOptions(tenantId,"branches",page);
  return <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-semibold">Branch scope</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={id} checked={value===null} disabled={disabled} onChange={()=>onChange(null)}/>All branches</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={id} checked={value!==null} disabled={disabled} onChange={()=>onChange([])}/>Selected branches</label>{value!==null&&<><p className="text-xs text-muted">{value.length} selected. Selecting none grants no branch access.</p>{q.isLoading?<PageLoader variant="compact"/>:q.isError?<p role="alert">Could not load branches. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>:<div className="grid gap-2 sm:grid-cols-2">{q.data?.items.map(b=><label key={b.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={value.includes(b.id)} disabled={disabled} onChange={e=>onChange(e.target.checked?[...value,b.id]:value.filter(v=>v!==b.id))}/><span className="min-w-0 break-words">{b.name}</span></label>)}</div>}{(q.data?.total||0)>50&&<div className="flex justify-between"><Button type="button" variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Previous branches</Button><Button type="button" variant="outline" disabled={page*50>=(q.data?.total||0)} onClick={()=>setPage(page+1)}>Next branches</Button></div>}</>}</fieldset>;
}
