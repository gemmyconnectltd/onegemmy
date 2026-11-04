"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { Building2, Check, ChevronDown, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkspaceBranches, useMyBranch } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { confirmWorkspaceChange } from "@/lib/unsavedChanges";

function subscribe(cb: () => void) { const media = window.matchMedia("(max-width: 767px)"); media.addEventListener("change", cb); return () => media.removeEventListener("change", cb); }
const smallSnapshot = () => window.matchMedia("(max-width: 767px)").matches;
/** The current identity has one business. Branch choices come only from the tenant-scoped, authorized endpoint. */
export function BranchSwitcher() {
  const { user, activeBranchId } = useAuth();
  const currentBranch = useMyBranch(activeBranchId || undefined, { enabled: !!activeBranchId });
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore(subscribe, smallSnapshot, () => false);
  if (!user?.tenantId) return null;
  const triggerContent = <><Building2 size={16} className="hidden shrink-0 text-accent min-[400px]:block" /><span className="min-w-0 text-left"><span className="block truncate text-[13px] font-semibold leading-tight sm:text-sm">{user.tenantName || "My business"}</span><span className="block truncate text-[11px] leading-tight text-muted sm:text-xs">{currentBranch.data?.name || user.branchName || (activeBranchId ? "Selected branch" : "All authorized branches")}</span></span><ChevronDown size={14} className="shrink-0 text-muted" /></>;
  const triggerClass = "flex h-9 sm:h-11 min-w-0 max-w-full items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-surface px-2 sm:px-3";
  return <div className="min-w-0 max-w-64 flex-1 sm:flex-none sm:w-52">
    {mobile ? <><button type="button" aria-label="Switch business and branch" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`${triggerClass} w-full`}>{triggerContent}</button><Drawer open={open} onClose={() => setOpen(false)} side="bottom" title="Business & branch"><WorkspaceChoices key={String(open)} close={() => setOpen(false)} /></Drawer></> :
      <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger aria-label="Switch business and branch" className={`${triggerClass} w-full`}>{triggerContent}</Popover.Trigger><Popover.Portal><Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} className="z-[110]"><Popover.Popup className="flex max-h-[min(80dvh,640px)] w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-xl"><div className="flex items-center justify-between border-b border-border px-4 py-2"><Popover.Title className="pesaa-card-title">Business &amp; branch</Popover.Title><Popover.Close aria-label="Close workspace selector" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface"><X size={18} /></Popover.Close></div><WorkspaceChoices key={String(open)} close={() => setOpen(false)} /></Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>}
  </div>;
}
function WorkspaceChoices({ close }: { close: () => void }) {
  const { user, activeBranchId, setActiveBranchId, hasPermission } = useAuth();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(activeBranchId);
  const [message, setMessage] = useState("");
  const branches = useWorkspaceBranches(page);
  const fixed = !!user?.branchId;
  const items = branches.data?.items ?? [];
  const currentName = items.find((b) => b.id === activeBranchId)?.name || user?.branchName || (activeBranchId ? "Selected branch" : "All authorized branches");
  const apply = () => {
    if (selected === activeBranchId || fixed || !confirmWorkspaceChange()) return;
    setActiveBranchId(selected); // clears workspace query data before the new context is rendered
    setMessage("Workspace updated.");
    close();
  };
  return <div className="min-h-0 p-4 space-y-4">
    <div className="rounded-xl border border-border bg-surface p-3"><p className="text-xs font-semibold text-muted">Current workspace</p><p className="break-words font-semibold">{user?.tenantName || "My business"}</p><p className="text-sm text-muted">{currentName}</p></div>
    <div><h3 className="text-sm font-semibold">Business</h3><p className="mt-1 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{user?.tenantName || "My business"}</span><Check size={16} className="shrink-0 text-accent" aria-label="Current business" /></p></div>
    <fieldset className="min-w-0"><legend className="mb-2 text-sm font-semibold">Select branch</legend>
      {branches.isLoading ? <PageLoader variant="compact" /> : branches.isError ? <div role="alert" className="text-sm text-muted">Could not load authorized branches. <Button variant="outline" onClick={() => void branches.refetch()}>Retry</Button></div> : <>
        {!fixed && <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface"><input type="radio" name="workspace-branch" checked={selected === null} onChange={() => setSelected(null)} /><span className="text-sm">All authorized branches</span></label>}
        {items.map((b) => <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface"><input type="radio" name="workspace-branch" checked={fixed ? user?.branchId === b.id : selected === b.id} disabled={fixed} onChange={() => setSelected(b.id)} /><span className="min-w-0 flex-1 break-words text-sm">{b.name}{b.is_main ? " (Main)" : ""}</span>{b.id === activeBranchId && <Check size={16} className="shrink-0 text-accent" aria-label="Current branch" />}</label>)}
        {!items.length && <p className="text-sm text-muted">No branches assigned.</p>}
        {(branches.data?.total ?? 0) > 20 && <div className="mt-2 flex items-center justify-between gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs text-muted">Page {page}</span><Button variant="outline" disabled={page * 20 >= (branches.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </>}
    </fieldset>
    {message && <p role="status" className="text-sm text-accent">{message}</p>}
    <div className="sticky bottom-0 space-y-2 border-t border-border bg-card pt-3 pb-[env(safe-area-inset-bottom)]"><Button className="w-full" disabled={fixed || selected === activeBranchId || branches.isLoading || branches.isError} onClick={apply}>Switch to selected workspace</Button>{hasPermission("branches:read") && <Link href="/branches" onClick={close} className="flex min-h-11 items-center justify-center text-sm font-semibold text-accent">Manage businesses &amp; branches</Link>}</div>
  </div>;
}
