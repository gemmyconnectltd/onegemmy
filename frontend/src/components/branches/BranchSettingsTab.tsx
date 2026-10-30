"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/branches/parts";
import { BranchForm } from "@/components/branches/BranchForm";
import { useDeleteMyBranch, useMyBranches, useSetMainBranch, useUpdateMyBranch } from "@/lib/api/hooks";
import type { ApiBranch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deactivationNotes, type BranchForm as Values } from "@/lib/branchView";

const detail = (e: unknown, fallback: string) => (e as { detail?: string })?.detail ?? fallback;

export function BranchSettingsTab({ branch, staff }: { branch: ApiBranch; staff: number }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("branches:update");
  const canDelete = hasPermission("branches:delete");
  const update = useUpdateMyBranch();
  const setMain = useSetMainBranch();
  const remove = useDeleteMyBranch();
  const { confirm, dialog } = useConfirmDialog();
  const others = (useMyBranches().data?.items ?? []).filter((b) => b.id !== branch.id).map((b) => b.name);
  const [problem, setProblem] = useState<string | null>(null);
  const active = branch.status === "active";
  const initial: Values = { name: branch.name, location: branch.location ?? "", phone: branch.phone ?? "", email: branch.email ?? "", status: active ? "active" : "inactive" };

  const flip = () => confirm({
    title: active ? `Deactivate ${branch.name}?` : `Reactivate ${branch.name}?`,
    message: active ? deactivationNotes(branch, staff).join(" ") : "It becomes available for work again. Your plan's branch limit applies.",
    confirmLabel: active ? "Deactivate" : "Reactivate", danger: active,
    onConfirm: () => void update.mutateAsync({ id: branch.id, data: { status: active ? "inactive" : "active" } }).then(() => setProblem(null)).catch((e: unknown) => setProblem(detail(e, "Couldn't change the status."))),
  });
  const makeMain = () => confirm({
    title: `Make ${branch.name} the main branch?`, message: "The main branch is where work lands when someone has no branch of their own. Only one branch can be the main one.", confirmLabel: "Make main branch",
    onConfirm: () => void setMain.mutateAsync(branch.id).then(() => setProblem(null)).catch((e: unknown) => setProblem(detail(e, "Couldn't change the main branch."))),
  });
  const del = () => confirm({
    title: `Delete ${branch.name}?`, message: "This can't be undone. A branch that has sales, expenses or transfers can't be deleted: deactivate it instead to keep its history.", confirmLabel: "Delete branch", danger: true,
    onConfirm: () => void remove.mutateAsync(branch.id).then(() => router.replace("/branches")).catch((e: unknown) => setProblem(detail(e, "Couldn't delete this branch."))),
  });

  return (
    <div className="space-y-4">
      <Card title="General information and contact" hint={canEdit ? undefined : "You can view this branch but need permission to edit it."}>
        <div className="max-w-2xl">
          <BranchForm key={`${branch.name}|${branch.location}|${branch.phone}|${branch.email}`} initial={initial} others={others} submitLabel="Save changes" disabled={!canEdit}
            onSubmit={async (v) => { await update.mutateAsync({ id: branch.id, data: { name: v.name, location: v.location || null, phone: v.phone || null, email: v.email || null } }); }} />
        </div>
      </Card>
      {problem && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-700 dark:text-red-400">{problem}</p>}
      <Card title="Status" hint="Deactivating keeps all history; it only stops the branch being used for new work.">
        <p className="text-sm text-foreground">This branch is <strong>{active ? "active" : "inactive"}</strong>.</p>
        {branch.is_main && <p className="mt-1 text-[13px] text-muted">It is the main branch, so it can&apos;t be deactivated. Make another branch the main one first.</p>}
        {canEdit && !branch.is_main && <Button variant={active ? "outline" : "secondary"} size="sm" className="mt-3" onClick={flip} disabled={update.isPending}>{active ? "Deactivate branch" : "Reactivate branch"}</Button>}
      </Card>
      {canEdit && !branch.is_main && active && <Card title="Main branch"><p className="text-sm text-muted">Make this the branch where work lands when a person has no branch of their own.</p><Button variant="secondary" size="sm" className="mt-3" onClick={makeMain} disabled={setMain.isPending}>Make main branch</Button></Card>}
      {canDelete && !branch.is_main && <Card title="Delete branch" className="border-red-500/30"><p className="text-sm text-muted">Only for a branch created by mistake. Branches with records are kept: deactivate them instead.</p><Button variant="destructive" size="sm" className="mt-3" onClick={del} disabled={remove.isPending}>Delete branch</Button></Card>}
      {dialog}
    </div>
  );
}
