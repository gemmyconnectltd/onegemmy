"use client";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useEmployeeAccess, useSaveTeamPermissions, useSetEmployeeFeature, useTeamPermissions } from "@/lib/api/hooks";
import type { EmployeeAccess, TeamPermissions } from "@/lib/api/admin";
import { ActionChip, ActionRow, PermissionTable } from "./EmployeePermissions";

type Module = EmployeeAccess["modules"][number];
type Group = TeamPermissions["groups"][number];

/** What this person ends up with in a module: the business setting, their switch and their permissions together. */
function accessOf(m: Module, active: boolean): { label: string; tone: Tone } {
  if (m.status === "restricted") return { label: "Restricted by platform", tone: "slate" };
  if (m.status === "not_included") return { label: "Not in plan", tone: "slate" };
  if (m.blocked) return { label: "Off", tone: "slate" };
  if (!active) return { label: "Account inactive", tone: "slate" };
  if (m.effective_change) return { label: "View and edit", tone: "green" };
  if (m.effective_view) return { label: "View only", tone: "amber" };
  return { label: "No access", tone: "slate" };
}
/** Till features shown inside the Point of sale card. Each is one permission, some owned by other modules (credit, discounts, returns, customers). */
const TILL_CONTROLS: { name: string; label: string; help: string }[] = [
  { name: "pos:read", label: "Use the Point of Sale", help: "Open the till and sell." },
  { name: "credit:create", label: "Partial payment and credit sales", help: "Let a customer pay part now, or nothing now, and owe the rest." },
  { name: "credit:approve", label: "Approve credit over the daily limit", help: "Allow a credit sale past the customer's daily limit." },
  { name: "discounts:apply", label: "Give discounts at checkout", help: "Apply a manual discount or a coupon on a sale." },
  { name: "orders:approve", label: "Change the sale date and approve sales", help: "Record a sale on an earlier date, approve or void sales." },
  { name: "returns:create", label: "Process returns", help: "Take back items and refund the customer." },
  { name: "contacts:create", label: "Add new customers", help: "Create a customer from the till." },
  { name: "contacts:update", label: "Edit customers", help: "Change a customer's details from the till." },
];

const closedFor = (m: Module) => m.status === "restricted" || m.status === "not_included";

/** Features and permissions together: each module's on/off switch, with the actions it allows right underneath. */
export default function AccessByModule({ tenantId, userId }: { tenantId: string; userId: string }) {
  const access = useEmployeeAccess(tenantId, userId);
  const perms = useTeamPermissions(tenantId, userId);
  if (access.isLoading || perms.isLoading) return <PageLoader variant="compact" />;
  if (access.isError || perms.isError || !access.data || !perms.data) return <p role="alert">Could not load this user&apos;s access. <Button variant="outline" onClick={() => { void access.refetch(); void perms.refetch(); }}>Retry</Button></p>;
  return <Editor key={`${perms.data.role_id}:${perms.data.permission_ids.join(",")}`} tenantId={tenantId} userId={userId} access={access.data} perms={perms.data} />;
}

function Editor({ tenantId, userId, access, perms }: { tenantId: string; userId: string; access: EmployeeAccess; perms: TeamPermissions }) {
  const feature = useSetEmployeeFeature();
  const save = useSaveTeamPermissions();
  const { confirm, dialog } = useConfirmDialog();
  const [selected, setSelected] = useState(() => new Set(perms.permission_ids));
  const [scope, setScope] = useState<"user" | "role">("user");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const baseline = useMemo(() => new Set(perms.baseline), [perms.baseline]);
  const owner = perms.is_owner || access.user.is_owner;
  const adminRole = ["admin", "owner"].includes((perms.role_name || "").toLowerCase());
  const dirty = selected.size !== perms.permission_ids.length || perms.permission_ids.some((id) => !selected.has(id));
  const setMany = (ids: string[], on: boolean) => setSelected((old) => { const next = new Set(old); for (const id of ids) { if (on) next.add(id); else next.delete(id); } return next; });
  const toggle = (id: string, on: boolean) => setSelected((old) => { const next = new Set(old); if (on) next.add(id); else next.delete(id); return next; });

  // Every module the business has, then permission groups with no module of their own (business administration).
  const groups = new Map(perms.groups.map((g) => [g.module, g]));
  const usable = (m: Module) => !closedFor(m);
  const items: { key: string; name: string; module?: Module; group?: Group }[] = [
    ...[...access.modules].sort((x, y) => Number(!usable(x)) - Number(!usable(y))).map((m) => ({ key: m.key, name: m.name, module: m, group: groups.get(m.key) })),
    ...perms.groups.filter((g) => !access.modules.some((m) => m.key === g.module)).map((g) => ({ key: g.module, name: g.name, group: g })),
  ];
  const q = search.trim().toLowerCase();
  const rowsOf = (it: (typeof items)[number]) => (it.group?.resources ?? []).filter((r) => !q || `${it.name} ${r.label} ${r.resource}`.toLowerCase().includes(q));
  const shown = items.filter((it) => !q || it.name.toLowerCase().includes(q) || rowsOf(it).length > 0);
  const isOpen = (key: string) => open.has(key) || !!q;
  const flip = (key: string) => setOpen((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const cellsOf = (g?: Group) => (g?.resources ?? []).flatMap((r) => Object.values(r.actions));
  const byName = new Map(perms.groups.flatMap((g) => g.resources.flatMap((r) => Object.values(r.actions))).map((c) => [c.name, c]));
  const openCount = access.modules.filter((m) => m.effective_view && !m.blocked).length;

  const submit = () => confirm({
    title: scope === "user" ? "Save individual permissions?" : "Change shared role permissions?",
    message: scope === "user" ? "This gives this user a dedicated role. Other users keep their existing permissions." : `This updates ${perms.role_name} for all ${perms.role_users} users holding it.`,
    confirmLabel: "Save permissions",
    onConfirm: () => save.mutate({ tenantId, userId, data: { permission_ids: [...selected], expected_role_id: perms.role_id, expected_permission_ids: perms.permission_ids, scope } }),
  });

  return (
    <div className="space-y-4">
      {dialog}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm">
          <p><span className="text-muted">Role </span><span className="font-semibold">{owner ? "Owner" : perms.role_name || "None"}</span>{!owner && <span className="text-muted"> · {perms.role_users} user{perms.role_users === 1 ? "" : "s"}</span>}</p>
          <p><span className="font-semibold">{openCount} of {access.modules.length}</span><span className="text-muted"> modules open</span></p>
          <p className="w-full text-xs text-muted">Module switches save immediately. Ticked actions save with the Save permissions button.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <Input aria-label="Search modules and permissions" placeholder="Search a module or action, e.g. expenses" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!owner && <Select aria-label="Permission changes apply to" value={scope} onChange={(e) => setScope(e.target.value as "user" | "role")}><option value="user">Changes: this user only</option><option value="role" disabled={!perms.role_id || adminRole}>Changes: everyone with this role</option></Select>}
        </div>
        <div className="flex items-center justify-end gap-1 border-t border-border px-3 py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen(new Set(items.map((i) => i.key)))}>Expand all</Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(new Set())}>Collapse all</Button>
        </div>
      </div>
      {owner && <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted">The business owner has full access to every module the business has. It cannot be reduced here.</p>}
      {feature.isError && <p role="alert" className="text-sm text-red-600">Could not update access. {feature.error.message}</p>}

      <ul className="space-y-2">
        {shown.map((it) => {
          const m = it.module, rows = rowsOf(it), expanded = isOpen(it.key), cells = cellsOf(it.group);
          const on = cells.filter((c) => owner || baseline.has(c.name) || selected.has(c.id)).length;
          const badge = m ? accessOf(m, access.user.is_active) : null;
          const panelId = `access-${it.key}`;
          return (
            <li key={it.key} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => flip(it.key)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                  <ChevronDown size={16} aria-hidden className={`flex-shrink-0 text-muted transition-transform ${expanded ? "" : "-rotate-90"}`} />
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-semibold ${m && closedFor(m) ? "text-muted" : "text-foreground"}`}>{it.name}</span>
                    <span className="block text-xs text-muted">{cells.length ? `${on} of ${cells.length} actions allowed` : "No separate actions"}{m?.status === "available" ? " · business has switched off changes" : ""}</span>
                  </span>
                </button>
                {badge && <Badge tone={badge.tone} className="hidden sm:inline-flex">{badge.label}</Badge>}
                {m && !owner && <Toggle checked={!m.blocked} disabled={feature.isPending} label={`Allow ${m.name} for ${access.user.full_name}`} onChange={(enabled) => feature.mutate({ tenantId, userId, module: m.key, enabled })} />}
              </div>
              {expanded && (
                <div id={panelId} className="border-t border-border">
                  {badge && <p className="border-b border-border px-4 py-2.5 text-xs text-muted sm:hidden">Access: {badge.label}</p>}
                  {m?.blocked && <p className="border-b border-border bg-surface px-4 py-2.5 text-xs text-muted">Switched off for this user. The actions below take effect once the module is switched on.</p>}
                  {!owner && cells.length > 0 && (() => { const editable = cells.filter((c) => !baseline.has(c.name)).map((c) => c.id); return editable.length > 1 && (
                    <div className="flex items-center justify-end gap-1 border-b border-border px-3 py-1.5">
                      <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => setMany(editable, true)}>Allow all</Button>
                      <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => setMany(editable, false)}>Clear</Button>
                    </div>); })()}
                  {it.key === "pos" && <TillControls cells={byName} owner={owner} baseline={baseline} selected={selected} disabled={owner || save.isPending} onToggle={toggle} />}
                  {rows.length ? <PermissionTable label={it.name} rows={rows} selected={owner ? new Set(cells.map((c) => c.id)) : selected} baseline={baseline} disabled={owner || save.isPending} onToggle={toggle} />
                    : it.key !== "pos" && <p className="px-4 py-3 text-sm text-muted">Access to this module follows its switch only.</p>}
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="rounded-xl border border-border bg-card p-4 text-sm text-muted">Nothing matches “{search}”.</li>}
      </ul>

      {save.isError && <p role="alert" className="text-sm text-red-600">{save.error.message}</p>}
      {save.isSuccess && !dirty && <p role="status" className="text-sm text-accent">Permissions saved.</p>}
      {!owner && dirty && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-lg">
          <span className="mr-auto text-sm font-semibold">Unsaved permission changes</span>
          <Button variant="outline" disabled={save.isPending} onClick={() => setSelected(new Set(perms.permission_ids))}>Discard</Button>
          <Button disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save permissions"}</Button>
        </div>
      )}
    </div>
  );
}

type Cell = Group["resources"][number]["actions"][string];

/** The till's features in the same rows and chips as every other module. */
function TillControls({ cells, owner, baseline, selected, disabled, onToggle }: { cells: Map<string, Cell>; owner: boolean; baseline: Set<string>; selected: Set<string>; disabled: boolean; onToggle: (id: string, on: boolean) => void }) {
  return (
    <ul aria-label="Till controls" className="divide-y divide-border">
      {TILL_CONTROLS.map((c) => {
        const cell = cells.get(c.name);
        const locked = owner || (!!cell && baseline.has(cell.name));
        return (
          <ActionRow key={c.name} title={c.label} help={cell ? c.help : "Not available for this business yet."}>
            {cell && <ActionChip label="Allowed" checked={locked || selected.has(cell.id)} locked={locked && !owner} disabled={disabled} onChange={(on) => onToggle(cell.id, on)} />}
          </ActionRow>
        );
      })}
    </ul>
  );
}
