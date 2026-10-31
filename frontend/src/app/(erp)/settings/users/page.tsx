"use client";
import { Button } from "@/components/ui/Button";

import Link from "next/link";
import { useState } from "react";
import {
  Plus, Pencil, Trash2, UserCheck, UserX, Search, KeyRound,
  AlertTriangle, ShieldCheck,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ProfileDetails, UserAvatar, StatusPill, roleBadgeClass } from "@/components/users/ProfileDetails";
import { EmptyState, ErrorState } from "@/components/hr/State";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import {
  useCompanyUsers, useCreateCompanyUser, useUpdateCompanyUser, useDeleteCompanyUser,
  useActivateCompanyUser, useDeactivateCompanyUser, useResetCompanyUserPassword,
  useCompanyUserActivity, useCurrentTenant, useMyBranches, useCompanyRoles, useRoleSummaries,
} from "@/lib/api/hooks";
import type { ApiUser } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/date";

type Tab = "profile" | "activity";

const STATUS_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
] as const;

const ACTIVITY_TONE: Record<string, string> = {
  "user.create": "bg-emerald-50 text-emerald-700",
  "user.update": "bg-blue-50 text-blue-700",
  "user.profile_update": "bg-blue-50 text-blue-700",
  "user.delete": "bg-red-50 text-red-600",
  "user.deactivate": "bg-amber-50 text-amber-700",
  "user.activate": "bg-emerald-50 text-emerald-700",
  "user.password_reset": "bg-violet-50 text-violet-700",
  login: "bg-surface text-muted",
};

const BUILT_IN_ROLES = ["admin", "member", "viewer", "owner/ceo", "general manager", "branch manager", "factory manager", "cashier", "accountant", "inventory officer"];
const ROLE_HELP: Record<string, string> = {
  viewer: "Can look at information but not change anything.",
  cashier: "Runs the till: sells, takes payment and looks up products and customers.",
  accountant: "Keeps the books: accounting, expenses, tax and banking. No stock or staff changes.",
  "inventory officer": "Looks after stock: products, receiving and counts. No finance access.",
  member: "Everyday work: create, view and edit records. Can't delete or approve.",
  "branch manager": "Runs a location, including deleting and approving. Not users, billing or settings.",
  "general manager": "Runs the business day to day. Not roles, billing or company settings.",
  "factory manager": "Manufacturing and the stock it uses.",
  admin: "Full access to everything, including users and billing. Give this sparingly.",
  "owner/ceo": "Full access to everything, including users and billing. Give this sparingly.",
};
const EMPTY_FORM = { full_name: "", email: "", phone: "", role: "viewer", branch_id: "", branch_ids: [] as string[], restrict_branches: false };

export default function UsersPage() {
  const { brandColor } = useAppConfig();
  const C = brandColor;
  const { hasPermission, user: authUser } = useAuth();
  const currentUserId = authUser?.id;
  const { data: tenant } = useCurrentTenant();
  const { data: branches } = useMyBranches();
  const { confirm, dialog } = useConfirmDialog();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [roleId, setRoleId] = useState("");
  const roleList = useRoleSummaries();

  const isActive = status === "all" ? undefined : status === "active";
  const { data, isLoading, isError, isFetching, refetch } = useCompanyUsers({ page, pageSize, search, isActive, roleId: roleId || undefined });

  const createUser = useCreateCompanyUser();
  const updateUser = useUpdateCompanyUser();
  const deleteUser = useDeleteCompanyUser();
  const activateUser = useActivateCompanyUser();
  const deactivateUser = useDeactivateCompanyUser();
  const resetPassword = useResetCompanyUserPassword();

  const [viewing, setViewing] = useState<ApiUser | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiUser | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canCreate = hasPermission("users:create");
  const canUpdate = hasPermission("users:update");
  const canDelete = hasPermission("users:delete");

  const branchNames = Object.fromEntries((branches?.items ?? []).map((b) => [b.id, b.name]));
  const branchText = (u: ApiUser) => {
    const ids = u.branch_ids ?? (u.branch_id ? [u.branch_id] : null);
    if (u.is_superuser || ids === null) return "All branches";
    if (ids.length === 0) return "None yet";
    return ids.map((id) => branchNames[id] ?? "Branch").join(", ");
  };

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const activeCount = users.filter((u) => u.is_active).length;

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setRoleId("");
    setPage(1);
  };

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  // ── actions ────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowAdd(true);
  };

  const openEdit = (u: ApiUser) => {
    setEditing(u);
    setForm({
      full_name: u.full_name,
      email: u.email,
      phone: u.phone ?? "",
      role: u.role,
      branch_id: u.branch_id ?? "",
      branch_ids: u.branch_ids ?? [],
      restrict_branches: u.branch_ids != null,
    });
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      setFormError("Name and email are required");
      return;
    }
    try {
      await createUser.mutateAsync({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        branch_id: form.branch_id || null,
        branch_ids: form.restrict_branches ? form.branch_ids : null,
      });
      setShowAdd(false);
      flash(`${form.full_name.trim()} was added. Check their email for the temporary password.`);
    } catch (err) {
      setFormError((err as { detail?: string })?.detail ?? "Could not add the user");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!form.full_name.trim()) {
      setFormError("Name is required");
      return;
    }
    try {
      await updateUser.mutateAsync({
        id: editing.id,
        data: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          branch_id: form.branch_id || null,
        branch_ids: form.restrict_branches ? form.branch_ids : null,
        },
      });
      setEditing(null);
      flash("User updated.");
    } catch (err) {
      setFormError((err as { detail?: string })?.detail ?? "Could not save the changes");
    }
  };

  const handleToggleActive = (u: ApiUser) => {
    const deactivating = u.is_active;
    confirm({
      title: deactivating ? "Deactivate user" : "Reactivate user",
      message: deactivating
        ? `${u.full_name} will be signed out and blocked from signing in again. Their data and history are kept, and you can reactivate them at any time.`
        : `${u.full_name} will be able to sign in again.`,
      confirmLabel: deactivating ? "Deactivate" : "Reactivate",
      danger: deactivating,
      onConfirm: async () => {
        try {
          if (deactivating) {
            await deactivateUser.mutateAsync(u.id);
            flash(`${u.full_name} deactivated.`);
          } else {
            await activateUser.mutateAsync(u.id);
            flash(`${u.full_name} reactivated.`);
          }
          setViewing((v) => (v && v.id === u.id ? { ...v, is_active: !deactivating } : v));
        } catch (err) {
          flash((err as { detail?: string })?.detail ?? "That action could not be completed");
        }
      },
    });
  };

  const handleResetPassword = (u: ApiUser) => {
    confirm({
      title: "Reset password",
      message: `A new temporary password will be generated and emailed to ${u.email}. They will be asked to change it after signing in. Your existing password stops working immediately.`,
      confirmLabel: "Reset & email",
      onConfirm: async () => {
        try {
          await resetPassword.mutateAsync({ id: u.id, sendEmail: true });
          flash(`Temporary password emailed to ${u.full_name}.`);
        } catch (err) {
          flash((err as { detail?: string })?.detail ?? "Password could not be reset");
        }
      },
    });
  };

  const handleDelete = (u: ApiUser) => {
    confirm({
      title: "Remove user",
      message: `${u.full_name} (${u.email}) will lose access immediately. This cannot be undone — their audit history is kept, but the account itself is gone. Consider deactivating instead if you may need to restore access.`,
      confirmLabel: "Remove user",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteUser.mutateAsync(u.id);
          setViewing((v) => (v && v.id === u.id ? null : v));
          flash(`${u.full_name} removed.`);
        } catch (err) {
          flash((err as { detail?: string })?.detail ?? "The user could not be removed");
        }
      },
    });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <PageLoader variant="page" />;

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Team &amp; Access</h1>
        <ErrorState message="Could not load your team" onRetry={() => refetch()} />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Team &amp; Access</h1>
          <p className="text-sm text-muted mt-0.5">
            {total} user{total === 1 ? "" : "s"} · {activeCount} active · {users.length - activeCount} deactivated
            {tenant?.name ? ` · ${tenant.name}` : ""}
          </p>
        </div>
        {canCreate && (
          <Button onClick={openAdd} className="bg-accent text-white hover:bg-accent/90"><Plus size={15} /> Add User</Button>
        )}
      </div>

      {toast && (
        <div className="flex items-start gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-accent flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-foreground">{toast}</p>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <form onSubmit={applySearch} className="flex-1 min-w-[220px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="pl-9"
            aria-label="Search users"
          />
        </form>
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}
          className="w-auto!"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
        <Select
          value={roleId}
          onChange={(e) => { setRoleId(e.target.value); setPage(1); }}
          className="w-auto!"
          aria-label="Filter by role"
        >
          <option value="">Any role</option>
          {roleList.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        {isFetching && <span className="text-[11px] text-muted">Updating…</span>}
      </div>

      <div className="space-y-3">
        {users.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {users.map((u) => (
              <li key={u.id} className={`flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 ${u.is_active ? "" : "opacity-75"}`}>
                <div className="flex items-start gap-3">
                  <UserAvatar name={u.full_name} color={C} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{u.full_name}{u.id === currentUserId && <span className="ml-1.5 text-[11px] font-medium text-muted">(you)</span>}</p>
                    <p className="truncate text-[12px] text-muted">{u.email}</p>
                  </div>
                  <StatusPill isActive={u.is_active} />
                </div>
                <div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${roleBadgeClass(u.role)}`}>{u.role}</span>
                  {ROLE_HELP[u.role.toLowerCase()] && <p className="mt-1.5 text-[12px] leading-snug text-muted">{ROLE_HELP[u.role.toLowerCase()]}</p>}
                </div>
                <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Phone</dt><dd className="min-w-0 truncate text-foreground">{u.phone || "Not added"}</dd>
                  <dt className="text-muted">Works in</dt><dd className="min-w-0 truncate text-foreground">{branchText(u)}</dd>
                  <dt className="text-muted">Features</dt><dd className="text-foreground">{u.is_superuser ? "Everything" : u.disabled_modules?.length ? `${u.disabled_modules.length} switched off` : "All their role allows"}</dd>
                  <dt className="text-muted">Last sign-in</dt><dd className="text-foreground">{u.last_login ? fmtDateTime(u.last_login) : "Never signed in"}</dd>
                  <dt className="text-muted">Added</dt><dd className="text-foreground">{u.created_at ? fmtDate(u.created_at) : "—"}</dd>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link href={`/settings/users/access/${u.id}`}><Button variant="secondary" size="sm"><ShieldCheck size={13} /> Manage access</Button></Link>
                  <Button variant="ghost" size="sm" onClick={() => { setViewing(u); setTab("profile"); }} aria-label={`More about ${u.full_name}`}>Details</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {users.length === 0 && (
          <EmptyState
            message={
              search || status !== "all" || roleId
                ? "No users match your search. Try clearing the filters."
                : "No users yet. Add your first team member to get started."
            }
          />
        )}
        {(search || status !== "all" || roleId) && users.length > 0 && (
          <div>
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        itemLabel="users"
        color={C}
      />

      {/* ── View Profile drawer ─────────────────────────────────────────── */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.full_name ?? ""}
        description={viewing?.tenant_name ? `${viewing.tenant_name} · ${viewing.email}` : viewing?.email}
        size="lg"
      >
        {viewing && (
          <div className="p-5 space-y-5">
            {/* Profile / Activity tabs */}
            <div className="flex gap-1 p-1 bg-surface rounded-lg">
              {([["profile", "Profile"], ["activity", "Activity"]] as [Tab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                    tab === key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "profile" ? (
              <>
                <ProfileDetails user={viewing} businessPhone={tenant?.phone} />

                {/* The six profile actions */}
                <div>
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {canUpdate && (
                      <ActionButton icon={Pencil} label="Edit Information" onClick={() => { setViewing(null); openEdit(viewing); }} />
                    )}
                    {canUpdate && (
                      <ActionButton
                        icon={KeyRound}
                        label="Reset Password"
                        onClick={() => handleResetPassword(viewing)}
                        disabled={viewing.id === currentUserId}
                      />
                    )}
                    {canUpdate && (
                      <ActionButton
                        icon={viewing.is_active ? UserX : UserCheck}
                        label={viewing.is_active ? "Deactivate" : "Reactivate"}
                        onClick={() => handleToggleActive(viewing)}
                        tone={viewing.is_active ? "warn" : "default"}
                        disabled={viewing.id === currentUserId}
                      />
                    )}
                    {canDelete && (
                      <ActionButton
                        icon={Trash2}
                        label="Remove User"
                        onClick={() => handleDelete(viewing)}
                        tone="danger"
                        disabled={viewing.id === currentUserId}
                      />
                    )}
                  </div>
                  {viewing.id === currentUserId && (
                    <p className="text-[11px] text-muted/70 mt-2 leading-relaxed">
                      This is you — you can&apos;t deactivate or remove your own account. Manage your own
                      details under{" "}
                      <a href="/profile" className="text-accent font-semibold hover:underline">
                        My Profile
                      </a>
                      .
                    </p>
                  )}
                </div>
              </>
            ) : (
              <UserActivityPanel userId={viewing.id} userName={viewing.full_name} color={C} />
            )}
          </div>
        )}
      </Drawer>

      <Drawer open={showAdd} onClose={() => setShowAdd(false)} title="Add User" description="Create a new team member account" size="md">
        <UserForm
          form={form}
          setForm={setForm}
          branches={branches?.items ?? []}
          formError={formError}
          onSubmit={handleCreate}
          label="Add User"
          onCancel={() => setShowAdd(false)}
        />
      </Drawer>
      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit User" description={editing?.full_name} size="md">
        <UserForm
          form={form}
          setForm={setForm}
          branches={branches?.items ?? []}
          formError={formError}
          onSubmit={handleEdit}
          label="Save Changes"
          lockedEmail
          onCancel={() => setEditing(null)}
        />
      </Drawer>

      {dialog}
    </div>
  );
}

// ── presentational helpers ──────────────────────────────────────────────────

type UserFormValues = typeof EMPTY_FORM;

function UserForm({
  form, setForm, branches, formError, onSubmit, label, lockedEmail, onCancel,
}: {
  form: UserFormValues;
  setForm: (f: UserFormValues) => void;
  branches: { id: string; name: string }[];
  formError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  label: string;
  lockedEmail?: boolean;
  onCancel: () => void;
}) {
  const [rolePage, setRolePage] = useState(1);
  const roles = useCompanyRoles(rolePage);
  return (
    <form onSubmit={onSubmit} className="p-5 space-y-4">
      <Field label="Full Name" required>
        <Input
          autoFocus
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="e.g. John Doe"
        />
      </Field>
      <Field
        label="Email Address"
        required={!lockedEmail}
        hint={lockedEmail ? "Email is the sign-in identity and can't be changed here." : "A temporary password is emailed to this address."}
      >
        <Input
          type="email"
          value={form.email}
          disabled={lockedEmail}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="user@example.com"
        />
      </Field>
      <Field label="Phone Number" hint="The person's own number. The company main line is separate.">
        <Input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="e.g. +233 20 123 4567"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Role" hint={ROLE_HELP[form.role] ?? "Determines what they can access."}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">Viewer — view only</option>
            <option value="cashier">Cashier</option>
            <option value="accountant">Accountant</option>
            <option value="inventory officer">Inventory Officer</option>
            <option value="member">Member</option>
            <option value="branch manager">Branch Manager</option>
            <option value="general manager">General Manager</option>
            <option value="factory manager">Factory Manager</option>
            {roles.data?.items.filter((role) => !BUILT_IN_ROLES.includes(role.name.toLowerCase())).map((role) => <option key={role.id} value={role.name.toLowerCase()}>{role.name}</option>)}
            <option value="admin">Admin — full access</option>
            <option value="owner/ceo">Owner/CEO — full access</option>
          </Select>
          {(roles.data?.total ?? 0) > 25 && <div className="mt-2 flex gap-2"><Button type="button" variant="outline" disabled={rolePage === 1} onClick={() => setRolePage(rolePage - 1)}>Previous roles</Button><Button type="button" variant="outline" disabled={rolePage * 25 >= (roles.data?.total ?? 0)} onClick={() => setRolePage(rolePage + 1)}>More roles</Button></div>}
        </Field>
        <Field label="Branch">
          <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Branch access" hint="Limit this user to selected branches, or retain access to all branches.">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.restrict_branches} onChange={(e) => setForm({ ...form, restrict_branches: e.target.checked })} />Restrict to assigned branches</label>
        {form.restrict_branches && <div className="grid grid-cols-2 gap-2 pt-2">{branches.map((branch) => <label key={branch.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.branch_ids.includes(branch.id)} onChange={(e) => setForm({ ...form, branch_ids: e.target.checked ? [...form.branch_ids, branch.id] : form.branch_ids.filter((id) => id !== branch.id), branch_id: !e.target.checked && form.branch_id === branch.id ? "" : form.branch_id })} />{branch.name}</label>)}</div>}
      </Field>
      {formError && <p className="text-[12px] font-semibold text-red-600">{formError}</p>}
      <FormFooter
        submitLabel={label}
        onCancel={onCancel}
        disabled={!form.full_name.trim() || (!lockedEmail && !form.email.trim())}
      />
    </form>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  disabled,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  tone?: "default" | "warn" | "danger";
  disabled?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 hover:bg-red-500/10"
      : tone === "warn"
        ? "text-amber-600 hover:bg-amber-500/10"
        : "text-muted hover:text-accent hover:bg-accent/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 h-9 rounded-lg bg-surface text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${toneClass}`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function UserActivityPanel({ userId, userName, color }: { userId: string; userName: string; color: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useCompanyUserActivity(userId, page, 20);

  if (isLoading) return <PageLoader variant="compact" />;
  if (isError) return <ErrorState message="Could not load activity" onRetry={() => refetch()} />;

  const entries = data?.items ?? [];

  if (entries.length === 0) {
    return <EmptyState message={`No activity recorded for ${userName} yet.`} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">
        Recent Activity — {data?.total ?? entries.length} event{(data?.total ?? 0) === 1 ? "" : "s"}
      </p>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {entries.map((e) => (
          <div key={e.id} className="bg-surface rounded-xl p-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13px] font-medium text-foreground leading-snug">{e.summary}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ACTIVITY_TONE[e.action] ?? "bg-surface text-muted"}`}>
                {e.action}
              </span>
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              {e.actor_name ? `${e.actor_name} · ` : ""}
              {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
            </p>
          </div>
        ))}
      </div>
      {(data?.total ?? 0) > 20 && (
        <Pagination
          page={page}
          pageSize={20}
          total={data!.total}
          onPageChange={setPage}
          itemLabel="events"
          color={color}
        />
      )}
    </div>
  );
}
