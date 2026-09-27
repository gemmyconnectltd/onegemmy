"use client";

import { useState } from "react";
import {
  Users, Plus, Pencil, Trash2, Shield, UserCheck, UserX, Search, Eye, KeyRound,
  Building2, Phone, AlertTriangle,
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
  useCompanyUserActivity, useCurrentTenant, useMyBranches,
} from "@/lib/api/hooks";
import type { ApiUser } from "@/lib/api";

type Tab = "profile" | "activity";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Deactivated only" },
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

const EMPTY_FORM = { full_name: "", email: "", phone: "", role: "member", branch_id: "" };

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

  const isActive = status === "all" ? undefined : status === "active";
  const { data, isLoading, isError, isFetching, refetch } = useCompanyUsers({ page, pageSize, search, isActive });

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
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Users &amp; Roles</h1>
        <ErrorState message="Could not load your team" onRetry={() => refetch()} />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Users &amp; Roles</h1>
          <p className="text-sm text-muted mt-0.5">
            {total} user{total === 1 ? "" : "s"} · {activeCount} active
            {tenant?.name ? ` · ${tenant.name}` : ""}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
            style={{ backgroundColor: C }}
          >
            <Plus size={15} /> Add User
          </button>
        )}
      </div>

      {toast && (
        <div className="flex items-start gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-accent flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-foreground">{toast}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: String(total), icon: Users, color: C },
          { label: "Active", value: String(activeCount), icon: UserCheck, color: "#10b981" },
          { label: "Deactivated", value: String(users.length - activeCount), icon: UserX, color: "#94a3b8" },
          { label: "Your Role", value: authUser?.role ?? "—", icon: Shield, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p
              className={`font-extrabold text-foreground tracking-tight truncate capitalize ${
                s.label === "Your Role" ? "text-[15px] sm:text-[17px]" : "text-lg sm:text-xl"
              }`}
              title={s.value}
            >
              {s.value}
            </p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

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
          className="w-auto"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">All Users</h2>
          {isFetching && <span className="text-[11px] text-muted">Updating…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">User</th>
                <th className="p-4 font-semibold">Company</th>
                <th className="p-4 font-semibold">Phone</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => { setViewing(u); setTab("profile"); }}
                      className="flex items-center gap-2.5 text-left min-w-0"
                    >
                      <UserAvatar name={u.full_name} color={C} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground truncate">{u.full_name}</span>
                        <span className="block text-[12px] text-muted truncate">{u.email}</span>
                      </span>
                    </button>
                  </td>
                  <td className="p-4 text-[13px] text-muted">
                    <span className="flex items-center gap-1.5 truncate">
                      <Building2 size={13} className="flex-shrink-0" />
                      {u.tenant_name ?? "—"}
                    </span>
                  </td>
                  <td className="p-4 text-[13px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Phone size={13} className="flex-shrink-0" />
                      {u.phone || "—"}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${roleBadgeClass(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4"><StatusPill isActive={u.is_active} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setViewing(u); setTab("profile"); }}
                        title="View profile"
                        aria-label={`View ${u.full_name}'s profile`}
                        className="w-7 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors flex items-center justify-center"
                      >
                        <Eye size={13} />
                      </button>
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          title={u.is_active ? "Deactivate" : "Reactivate"}
                          aria-label={`${u.is_active ? "Deactivate" : "Reactivate"} ${u.full_name}`}
                          className="w-7 h-7 rounded-lg bg-surface text-muted hover:text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center justify-center"
                        >
                          {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                        </button>
                      )}
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          title="Edit user"
                          aria-label={`Edit ${u.full_name}`}
                          className="w-7 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors flex items-center justify-center"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          title="Remove user"
                          aria-label={`Remove ${u.full_name}`}
                          className="w-7 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <EmptyState
            message={
              search || status !== "all"
                ? "No users match your search. Try clearing the filters."
                : "No users yet. Add your first team member to get started."
            }
          />
        )}
        {(search || status !== "all") && users.length > 0 && (
          <div className="px-5 py-3 border-t border-border">
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
                      <a href="/settings/profile" className="text-accent font-semibold hover:underline">
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" hint="Determines what they can access.">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </Select>
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
