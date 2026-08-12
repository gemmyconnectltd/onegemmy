"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Users, ShoppingCart, TrendingUp, Package, UserPlus, Loader2,
  CheckCircle, XCircle, PauseCircle, PlayCircle, Building2, Layers, Shield,
  Plus, Trash2, X, KeyRound, Copy, Check, SlidersHorizontal,
} from "lucide-react";
import {
  useTenant, useTenantStats, useTenantUsers, useSuspendTenant, useActivateTenant,
  useInviteUser, useDeleteUser, useTenantDepartments, useCreateDepartment,
  useDeleteDepartment, useTenantRoles, useCreateRole, useDeleteRole,
  useTenantBranches, useCreateBranch, useDeleteBranch, useResetUserPassword,
} from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import Link from "next/link";
import { SecondSidebar, type SectionItem } from "@/components/dashboard/SecondSidebar";
import FeaturesPanel from "./FeaturesPanel";

type Tab = "features" | "users" | "departments" | "roles" | "branches";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");

  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [showInvite, setShowInvite] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [resetUser, setResetUser] = useState<{ id: string; full_name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", role: "member", password: "" });
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [branchForm, setBranchForm] = useState({ name: "", location: "" });

  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useTenant(id);
  const { data: stats, isLoading: statsLoading, isError: statsError } = useTenantStats(id);
  const { data: usersData, isLoading: usersLoading, isError: usersError } = useTenantUsers(id);
  const { data: departmentsData, isLoading: deptsLoading, isError: deptsError } = useTenantDepartments(id);
  const { data: rolesData, isLoading: rolesLoading, isError: rolesError } = useTenantRoles(id);
  const { data: branchesData, isLoading: branchesLoading, isError: branchesError } = useTenantBranches(id);

  const users = usersData?.items ?? [];
  const departments = departmentsData?.items ?? [];
  const roles = rolesData?.items ?? [];
  const branches = branchesData?.items ?? [];

  const loading = tenantLoading || statsLoading || usersLoading;
  const isError = tenantError || statsError || usersError || deptsError || rolesError || branchesError;

  const loadErrorMessage = isError ? "Failed to load tenant" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const inviteUser = useInviteUser();
  const deleteUser = useDeleteUser();
  const createDepartment = useCreateDepartment();
  const deleteDepartment = useDeleteDepartment();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const resetPassword = useResetUserPassword();

  const toggleStatus = () => {
    if (!tenant) return;
    setActing(true);
    const m = tenant.is_active ? suspendTenant : activateTenant;
    m.mutate(id, {
      onError: () => setError("Failed to update status"),
      onSettled: () => setActing(false),
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteUser.mutate({ tenantId: id, data: inviteForm }, {
      onSuccess: () => {
        setShowInvite(false);
        setInviteForm({ email: "", full_name: "", role: "member", password: "" });
        setNotice(null);
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to invite user"),
    });
  };

  const handleRemoveUser = (u: { id: string; full_name: string }) => {
    deleteUser.mutate({ tenantId: id, userId: u.id }, {
      onSuccess: () => setNotice(null),
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to remove user"),
    });
  };

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    createDepartment.mutate({ tenantId: id, data: deptForm }, {
      onSuccess: () => {
        setShowAddDept(false);
        setDeptForm({ name: "", description: "" });
        setNotice(null);
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to create department"),
    });
  };

  const handleRemoveDepartment = (d: { id: string }) => {
    deleteDepartment.mutate({ tenantId: id, departmentId: d.id }, {
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to delete department"),
    });
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    createRole.mutate({ tenantId: id, data: roleForm }, {
      onSuccess: () => {
        setShowAddRole(false);
        setRoleForm({ name: "", description: "" });
        setNotice(null);
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to create role"),
    });
  };

  const handleRemoveRole = (r: { id: string }) => {
    deleteRole.mutate({ tenantId: id, roleId: r.id }, {
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to delete role"),
    });
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    createBranch.mutate({ tenantId: id, data: branchForm }, {
      onSuccess: () => {
        setShowAddBranch(false);
        setBranchForm({ name: "", location: "" });
        setNotice(null);
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to create branch"),
    });
  };

  const handleRemoveBranch = (b: { id: string }) => {
    deleteBranch.mutate({ tenantId: id, branchId: b.id }, {
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to delete branch"),
    });
  };

  const handleResetPassword = (u: { id: string; full_name: string }) => {
    setNotice(null);
    setTempPassword(null);
    setCopied(false);
    setResetUser(u);
  };

  const confirmResetPassword = () => {
    if (!resetUser) return;
    resetPassword.mutate({ tenantId: id, userId: resetUser.id }, {
      onSuccess: (res) => {
        setTempPassword(res.data?.temp_password ?? null);
      },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to reset password"),
    });
  };

  const copyPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

  if (error || !tenant) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error ?? "Tenant not found"}</div>
    </div>
  );

  const statCards = stats ? [
    { label: "Users",            value: stats.users,                          icon: Users,        color: c.primary },
    { label: "Total Orders",     value: stats.orders,                         icon: ShoppingCart, color: c.blue },
    { label: "Completed Orders", value: stats.completed_orders,               icon: CheckCircle,  color: c.income },
    { label: "Products",         value: stats.products,                       icon: Package,      color: c.gold },
    { label: "Revenue",          value: fmtMoney(stats.revenue), isStr: true, icon: TrendingUp,   color: c.profit },
  ] : [];

  const PLAN_COLORS: Record<string, string> = {
    free: "text-muted", starter: "text-blue-600 dark:text-blue-400", professional: "text-violet-600 dark:text-violet-400", enterprise: "text-amber-600 dark:text-amber-400",
  };

  const sections: SectionItem[] = [
    { key: "features", label: "Features & Access", icon: SlidersHorizontal },
    { key: "users", label: "Users", count: users.length, icon: Users },
    { key: "departments", label: "Departments", count: departments.length, icon: Layers },
    { key: "roles", label: "Roles", count: roles.length, icon: Shield },
    { key: "branches", label: "Branches", count: branches.length, icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/tenants" className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground hover:bg-border transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{tenant.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${tenant.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                {tenant.is_active ? "Active" : "Suspended"}
              </span>
              <span className={`text-[11px] font-semibold capitalize ${PLAN_COLORS[tenant.subscription_plan] ?? "text-muted"}`}>
                {tenant.subscription_plan}
              </span>
            </div>
            <p className="text-sm text-muted mt-0.5 font-mono">{tenant.slug} {tenant.city && `· ${tenant.city}`} {tenant.country && `· ${tenant.country}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus size={14} /> Invite User
          </button>
          <button
            onClick={toggleStatus}
            disabled={acting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              tenant.is_active
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            {acting ? <Loader2 size={14} className="animate-spin" /> : tenant.is_active ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            {tenant.is_active ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: `${card.color}18` }}>
              <card.icon size={14} style={{ color: card.color }} />
            </div>
            <p className="text-lg font-extrabold text-foreground tracking-tight truncate">{card.isStr ? card.value : Number(card.value).toLocaleString()}</p>
            <p className="text-[11px] text-muted mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {notice && (
        <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-muted hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* Section nav + panels */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:flex-shrink-0 lg:w-52">
          <SecondSidebar
            sections={sections}
            activeKey={tab}
            onSelect={(key) => setTab(key as Tab)}
            label={tenant.name}
            defaultOrientation="left"
            showToggle={false}
          />
        </div>
        <div className="flex-1 min-w-0 space-y-6">
          {/* Features & Access panel */}
          {tab === "features" && <FeaturesPanel tenantId={id} />}

      {/* Users panel */}
      {tab === "users" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Users ({users.length})</h2>
            <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline transition-colors">
              <UserPlus size={13} /> Invite
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider">
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-foreground">{u.full_name} {u.is_superuser && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent ml-1">SUPERADMIN</span>}</p>
                    <p className="text-[11px] text-muted">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface text-muted capitalize">{u.role}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`flex items-center gap-1 text-[11px] font-semibold w-fit ${u.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {u.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-muted">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!u.is_superuser && (
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={resetPassword.isPending}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50"
                        >
                          <KeyRound size={13} /> Reset
                        </button>
                      )}
                      {!u.is_superuser && (
                        <button
                          onClick={() => handleRemoveUser(u)}
                          disabled={deleteUser.isPending}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50"
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="py-12 text-center">
              <Users size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No users yet</p>
            </div>
          )}
        </div>
      )}

      {/* Departments panel */}
      {tab === "departments" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Departments ({departments.length})</h2>
            <button onClick={() => setShowAddDept(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline transition-colors">
              <Plus size={13} /> Add
            </button>
          </div>
          {departments.length === 0 ? (
            <div className="py-12 text-center">
              <Layers size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No departments yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {departments.map((d) => (
                <div key={d.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    {d.description && <p className="text-[11px] text-muted mt-0.5 truncate">{d.description}</p>}
                  </div>
                  <button
                    onClick={() => handleRemoveDepartment(d)}
                    disabled={deleteDepartment.isPending}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roles panel */}
      {tab === "roles" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Roles ({roles.length})</h2>
            <button onClick={() => setShowAddRole(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline transition-colors">
              <Plus size={13} /> Add
            </button>
          </div>
          {roles.length === 0 ? (
            <div className="py-12 text-center">
              <Shield size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No roles yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {roles.map((r) => (
                <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground capitalize">{r.name}</p>
                    {r.description && <p className="text-[11px] text-muted mt-0.5 truncate">{r.description}</p>}
                  </div>
                  <button
                    onClick={() => handleRemoveRole(r)}
                    disabled={deleteRole.isPending}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Branches panel */}
      {tab === "branches" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Branches ({branches.length})</h2>
            <button onClick={() => setShowAddBranch(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline transition-colors">
              <Plus size={13} /> Add
            </button>
          </div>
          {branches.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No branches yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {branches.map((b) => (
                <div key={b.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{b.name}</p>
                    <p className="text-[11px] text-muted mt-0.5">{b.location || "—"} {b.status && <span className="capitalize ml-1">· {b.status}</span>}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveBranch(b)}
                    disabled={deleteBranch.isPending}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Invite drawer */}
      <Drawer open={showInvite} onClose={() => setShowInvite(false)} title="Invite User" description={`Add a user to ${tenant.name}`}>
        <form onSubmit={handleInvite} className="space-y-4 p-5">
          <Field label="Full Name" required>
            <Input required value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} placeholder="John Doe" />
          </Field>
          <Field label="Email" required>
            <Input type="email" required value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="john@example.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
                {["admin", "member", "viewer"].map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </Select>
            </Field>
            <Field label="Temporary Password" required>
              <Input type="password" required value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="••••••••" />
            </Field>
          </div>
          <FormFooter submitLabel={inviteUser.isPending ? "Inviting…" : "Invite User"} onCancel={() => setShowInvite(false)} disabled={inviteUser.isPending} />
        </form>
      </Drawer>

      {/* Add department drawer */}
      <Drawer open={showAddDept} onClose={() => setShowAddDept(false)} title="Add Department" description={`Create a department in ${tenant.name}`}>
        <form onSubmit={handleCreateDepartment} className="space-y-4 p-5">
          <Field label="Name" required>
            <Input required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="Operations" />
          </Field>
          <Field label="Description">
            <Input value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} placeholder="Optional" />
          </Field>
          <FormFooter submitLabel={createDepartment.isPending ? "Creating…" : "Add Department"} onCancel={() => setShowAddDept(false)} disabled={createDepartment.isPending} />
        </form>
      </Drawer>

      {/* Add role drawer */}
      <Drawer open={showAddRole} onClose={() => setShowAddRole(false)} title="Add Role" description={`Create a role in ${tenant.name}`}>
        <form onSubmit={handleCreateRole} className="space-y-4 p-5">
          <Field label="Name" required>
            <Input required value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="manager" />
          </Field>
          <Field label="Description">
            <Input value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="Optional" />
          </Field>
          <FormFooter submitLabel={createRole.isPending ? "Creating…" : "Add Role"} onCancel={() => setShowAddRole(false)} disabled={createRole.isPending} />
        </form>
      </Drawer>

      {/* Add branch drawer */}
      <Drawer open={showAddBranch} onClose={() => setShowAddBranch(false)} title="Add Branch" description={`Create a branch in ${tenant.name}`}>
        <form onSubmit={handleCreateBranch} className="space-y-4 p-5">
          <Field label="Name" required>
            <Input required value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="Downtown Store" />
          </Field>
          <Field label="Location">
            <Input value={branchForm.location} onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })} placeholder="City, Country" />
          </Field>
          <FormFooter submitLabel={createBranch.isPending ? "Creating…" : "Add Branch"} onCancel={() => setShowAddBranch(false)} disabled={createBranch.isPending} />
        </form>
      </Drawer>

      {/* Reset password drawer */}
      <Drawer
        open={!!resetUser}
        onClose={() => { setResetUser(null); setTempPassword(null); setCopied(false); }}
        title="Reset Password"
        description={resetUser ? `Set a new temporary password for ${resetUser.full_name}` : ""}
      >
        <div className="p-5 space-y-4">
          {tempPassword === null ? (
            <>
              <p className="text-sm text-muted">
                This will immediately invalidate the user&apos;s current password and generate a new temporary one. They&apos;ll need to sign in with the new password shown here.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => { setResetUser(null); setCopied(false); }}
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmResetPassword}
                  disabled={resetPassword.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[13px] font-bold transition-colors disabled:opacity-50"
                >
                  {resetPassword.isPending ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                  Reset Password
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[13px] px-4 py-3">
                Temporary password shown once — copy it now and share with the user securely.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 font-mono text-sm text-foreground break-all">
                  {tempPassword}
                </code>
                <button
                  onClick={copyPassword}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { setResetUser(null); setTempPassword(null); setCopied(false); }}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[13px] font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
