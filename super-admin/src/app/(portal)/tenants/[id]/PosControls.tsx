"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSaveTeamPermissions, useTeamPermissions } from "@/lib/api/hooks";
import type { TeamPermissions } from "@/lib/api/admin";

/** What each Point of Sale feature needs. Each switch is one permission, so the till and the server enforce exactly what is shown here. */
const POS_CONTROLS: { name: string; label: string; help: string }[] = [
  { name: "pos:read", label: "Use the Point of Sale", help: "Open the till and sell." },
  { name: "credit:create", label: "Partial payment and credit sales", help: "Let a customer pay part now, or nothing now, and owe the rest." },
  { name: "credit:approve", label: "Approve credit over the daily limit", help: "Allow a credit sale that goes past the customer's daily limit." },
  { name: "discounts:apply", label: "Give discounts at checkout", help: "Apply a manual discount or a coupon on a sale." },
  { name: "orders:approve", label: "Change the sale date and approve sales", help: "Record a sale on an earlier date, approve or void sales." },
  { name: "returns:create", label: "Process returns", help: "Take back items and refund the customer." },
  { name: "contacts:create", label: "Add new customers", help: "Create a customer from the till." },
  { name: "contacts:update", label: "Edit customers", help: "Change a customer's details from the till." },
];

export default function PosControls({ tenantId, userId }: { tenantId: string; userId: string }) {
  const q = useTeamPermissions(tenantId, userId);
  if (q.isLoading) return <PageLoader variant="compact" />;
  if (q.isError || !q.data) return <p role="alert">Could not load this user&apos;s POS controls. <Button variant="outline" onClick={() => void q.refetch()}>Retry</Button></p>;
  return <Editor key={`${q.data.role_id}:${q.data.permission_ids.join(",")}`} tenantId={tenantId} userId={userId} data={q.data} />;
}

function Editor({ tenantId, userId, data }: { tenantId: string; userId: string; data: TeamPermissions }) {
  const save = useSaveTeamPermissions();
  const { confirm, dialog } = useConfirmDialog();
  const [selected, setSelected] = useState(() => new Set(data.permission_ids));
  if (data.is_owner) return <p className="text-sm text-muted">The business owner can use every Point of Sale feature.</p>;
  const byName = new Map(data.groups.flatMap((g) => g.resources.flatMap((r) => Object.values(r.actions))).map((c) => [c.name, c]));
  const baseline = new Set(data.baseline);
  const dirty = selected.size !== data.permission_ids.length || data.permission_ids.some((id) => !selected.has(id));
  const toggle = (id: string, on: boolean) => setSelected((old) => { const next = new Set(old); if (on) next.add(id); else next.delete(id); return next; });
  const submit = () => confirm({
    title: "Save Point of Sale controls?",
    message: `Only this user changes: they get their own role (copied from ${data.role_name || "their current role"}) with these settings. Other users keep theirs.`,
    confirmLabel: "Save",
    onConfirm: () => save.mutate({ tenantId, userId, data: { permission_ids: [...selected], expected_role_id: data.role_id, expected_permission_ids: data.permission_ids, scope: "user" } }),
  });
  return (
    <div className="space-y-4">{dialog}
      <p className="text-sm text-muted">Turn each till feature on or off for this user. The Point of Sale module must also be switched on for the business and for them under Features.</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {POS_CONTROLS.map((c) => {
          const cell = byName.get(c.name);
          const automatic = !!cell && baseline.has(cell.name);
          const on = !!cell && (automatic || selected.has(cell.id));
          return (
            <li key={c.name} className="flex items-start justify-between gap-3 px-3 py-3">
              <label htmlFor={`pos-${c.name}`} className="min-w-0"><span className="block text-sm font-semibold">{c.label}</span><span className="block text-xs text-muted">{cell ? c.help : "Not available for this business yet."}{automatic ? " Always on for staff." : ""}</span></label>
              <input id={`pos-${c.name}`} type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={on} disabled={!cell || automatic || save.isPending} onChange={(e) => cell && toggle(cell.id, e.target.checked)} />
            </li>
          );
        })}
      </ul>
      {save.isError && <p role="alert" className="text-sm text-red-600">{save.error.message}</p>}
      {save.isSuccess && <p role="status" className="text-sm text-accent">Saved. It applies on their next action at the till.</p>}
      <Button disabled={!dirty || save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save Point of Sale controls"}</Button>
    </div>
  );
}
