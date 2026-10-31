"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { Back, Pill } from "@/components/users/AccessParts";
import { useCompanyRoles, useCreateCompanyRole, useDeleteCompanyRole, useRoleSummaries, useSeedDefaultRoles } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";

export default function RolesPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("roles:update");
  const summaries = useRoleSummaries();
  const details = useCompanyRoles(1);
  const create = useCreateCompanyRole();
  const remove = useDeleteCompanyRole();
  const seed = useSeedDefaultRoles();
  const [seeded, setSeeded] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const description = (id: string) => details.data?.items.find((r) => r.id === id)?.description;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try { const res = await create.mutateAsync({ name: form.name.trim(), description: form.description.trim() }); setOpen(false); setForm({ name: "", description: "" }); router.push(`/settings/users/roles/${res.data.id}`); }
    catch (err: unknown) { setError((err as { detail?: string })?.detail ?? "Couldn't create the role. Use a name that isn't taken."); }
  };
  const del = (id: string, name: string) => confirm({
    title: `Delete ${name}?`, message: "The role is removed. Nobody holds it, so no one's access changes.", confirmLabel: "Delete role", danger: true,
    onConfirm: () => void remove.mutateAsync(id).catch((e: unknown) => setError((e as { detail?: string })?.detail ?? "Couldn't delete this role.")),
  });

  if (summaries.isLoading) return <PageLoader variant="compact" />;
  if (summaries.isError || !summaries.data) return <p role="alert" className="py-8 text-center text-sm text-red-600">You don&apos;t have access to roles, or they couldn&apos;t be loaded.</p>;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Back href="/settings/users">Team &amp; Access</Back><h1 className="text-[22px] font-bold tracking-tight text-foreground">Roles &amp; Permissions</h1><p className="mt-0.5 text-sm text-muted">Reusable sets of permissions. Give a person a role to decide what they can do.</p></div>
        {canEdit && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={seed.isPending} onClick={() => void seed.mutateAsync().then((r) => setSeeded(r.data.added.length ? `Added: ${r.data.added.join(", ")}.` : "Your business already has every built-in role.")).catch((e: { detail?: string }) => setError(e?.detail ?? "Couldn't add the built-in roles."))}>{seed.isPending && <Loader2 size={13} className="animate-spin" />} Add built-in roles</Button><Button onClick={() => setOpen(true)}><Plus size={15} /> New role</Button></div>}
      </div>
      {seeded && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">{seeded} Roles you already had were not changed.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <TableScroll><table className="w-full min-w-[680px] text-left text-sm">
          <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className="px-4 py-3 font-semibold">Role</th><th scope="col" className="px-4 py-3 font-semibold">Description</th><th scope="col" className="px-4 py-3 text-right font-semibold">People</th><th scope="col" className="px-4 py-3 text-right font-semibold">Permissions</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-border">{summaries.data.map((r) => (
            <tr key={r.id} className="hover:bg-surface/50">
              <td className="px-4 py-3"><p className="font-semibold text-foreground">{r.name}</p><Pill tone={r.builtIn ? "slate" : "green"}>{r.builtIn ? "Built in" : "Custom"}</Pill></td>
              <td className="max-w-sm px-4 py-3 text-[12px] text-muted">{description(r.id) || "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.users}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.permissions}</td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2">
                <Link href={`/settings/users/roles/${r.id}`}><Button variant="secondary" size="sm">{canEdit ? "View & edit" : "View"}</Button></Link>
                {canEdit && !r.builtIn && r.users === 0 && <Button variant="outline" size="sm" onClick={() => del(r.id, r.name)} disabled={remove.isPending}>Delete</Button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></TableScroll>
      </div>
      <p className="text-[12px] text-muted">Built-in roles can be tuned but not renamed or deleted. A role that people hold can&apos;t be deleted: move them to another role first.</p>
      <Drawer open={open} onClose={() => setOpen(false)} title="New role" size="md">
        <form onSubmit={add} className="space-y-4 p-5">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shift lead" autoFocus /></Field>
          <Field label="Description" hint="Optional. Helps others pick the right role."><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {error && <p role="alert" className="text-[12px] font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!form.name.trim() || create.isPending}>{create.isPending && <Loader2 size={13} className="animate-spin" />} Create and set permissions</Button></div>
        </form>
      </Drawer>
      {dialog}
    </div>
  );
}
