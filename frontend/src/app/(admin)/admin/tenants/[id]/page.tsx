"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Users, ShoppingCart, TrendingUp, Package, UserPlus, Loader2,
  CheckCircle, XCircle, Building2, Layers, Shield,
  Plus, Trash2, X, KeyRound, Copy, Check, SlidersHorizontal,
  AlertTriangle, RotateCcw,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useTenant, useTenantStats, useTenantUsers, useSuspendTenant, useActivateTenant,
  useInviteUser, useDeleteUser, useTenantDepartments, useCreateDepartment,
  useDeleteDepartment, useTenantRoles, useCreateRole, useDeleteRole,
  useTenantBranches, useCreateBranch, useDeleteBranch, useResetUserPassword,
  useUpdateTenant, useResetTenantData,
} from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { tenantStatusLabel } from "@/lib/api/admin";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import Link from "next/link";
import FeaturesPanel from "./FeaturesPanel";
import { resolveUploadUrl } from "@/lib/api/client";

type Tab = "features" | "users" | "departments" | "roles" | "branches";

// Mirrors the value->label mapping on the register form's step 2 (the only
// place this value is ever set) since the DB stores the raw value, not the label.
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  sole: "Sole Proprietorship",
  partnership: "Partnership",
  llc: "Limited Liability (LLC)",
  unregistered: "Not Registered",
};

type SectionItem = {
  key: string;
  label: string;
  icon: React.ElementType;
  count?: number;
  color?: string;
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { theme, currencies } = useAppConfig();
  const c = chartPalette(theme === "dark");

  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [showInvite, setShowInvite] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [resetUser, setResetUser] = useState<{ id: string; full_name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showResetData, setShowResetData] = useState(false);
  const [resetConfirmName, setResetConfirmName] = useState("");
  const [resetResult, setResetResult] = useState<Record<string, number> | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", role: "member", password: "" });
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [branchForm, setBranchForm] = useState({ name: "", location: "" });

  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useTenant(id);
  const { data: stats, isLoading: statsLoading, isError: statsError } = useTenantStats(id);
  const { data: usersData, isLoading: usersLoading, isError: usersError } = useTenantUsers(id);
  const { data: departmentsData, isError: deptsError } = useTenantDepartments(id);
  const { data: rolesData, isError: rolesError } = useTenantRoles(id);
  const { data: branchesData, isError: branchesError } = useTenantBranches(id);

  const users = usersData?.items ?? [];
  const departments = departmentsData?.items ?? [];
  const roles = rolesData?.items ?? [];
  const branches = branchesData?.items ?? [];

  const loading = tenantLoading || statsLoading || usersLoading;
  const coreError = tenantError || statsError || usersError;

  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const updateTenant = useUpdateTenant();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const inviteUser = useInviteUser();
  const deleteUser = useDeleteUser();
  const createDepartment = useCreateDepartment();
  const deleteDepartment = useDeleteDepartment();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const resetPassword = useResetUserPassword();
  const resetTenantData = useResetTenantData();

  const removableUserIds = users.filter((u) => !u.is_superuser).map((u) => u.id);
  const bulkUsers = useBulkSelection(removableUserIds);
  const bulkDepartments = useBulkSelection(departments.map((d) => d.id));
  const bulkRoles = useBulkSelection(roles.map((r) => r.id));
  const bulkBranches = useBulkSelection(branches.map((b) => b.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDeleteUsers() {
    confirm({
      title: "Remove users?",
      message: `Remove ${bulkUsers.count} selected user${bulkUsers.count === 1 ? "" : "s"} from this tenant? They will lose access immediately.`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulkUsers.selected).map((userId) => deleteUser.mutateAsync({ tenantId: id, userId })));
        setBulkDeleting(false);
        bulkUsers.clear();
      },
    });
  }

  function confirmBulkDeleteDepartments() {
    confirm({
      title: "Delete departments?",
      message: `Delete ${bulkDepartments.count} selected department${bulkDepartments.count === 1 ? "" : "s"}?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulkDepartments.selected).map((departmentId) => deleteDepartment.mutateAsync({ tenantId: id, departmentId })));
        setBulkDeleting(false);
        bulkDepartments.clear();
      },
    });
  }

  function confirmBulkDeleteRoles() {
    confirm({
      title: "Delete roles?",
      message: `Delete ${bulkRoles.count} selected role${bulkRoles.count === 1 ? "" : "s"}?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulkRoles.selected).map((roleId) => deleteRole.mutateAsync({ tenantId: id, roleId })));
        setBulkDeleting(false);
        bulkRoles.clear();
      },
    });
  }

  function confirmBulkDeleteBranches() {
    confirm({
      title: "Delete branches?",
      message: `Delete ${bulkBranches.count} selected branch${bulkBranches.count === 1 ? "" : "es"}?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulkBranches.selected).map((branchId) => deleteBranch.mutateAsync({ tenantId: id, branchId })));
        setBulkDeleting(false);
        bulkBranches.clear();
      },
    });
  }

  const toggleStatus = () => {
    if (!tenant) return;

    const action = tenant.is_active ? "suspend" : "activate";
    const run = () => {
      setActing(true);
      setNotice(null);
      const onSettled = () => setActing(false);
      const onSuccess = () => setNotice({ kind: "success", text: `Tenant ${action}d` });
      const onError = () => setNotice({ kind: "error", text: "Failed to update status" });
      if (tenant.is_active) {
        suspendTenant.mutate(id, { onSuccess, onError, onSettled });
      } else {
        activateTenant.mutate({ id }, { onSuccess, onError, onSettled });
      }
    };
    confirm({
      title: `${tenant.is_active ? "Suspend" : "Activate"} organization?`,
      message: `Are you sure you want to ${action} "${tenant.name}"? This affects the whole company.`,
      confirmLabel: tenant.is_active ? "Suspend" : "Activate",
      danger: action === "suspend",
      onConfirm: run,
    });
  };

  const changeCurrency = (code: string) => {
    if (!tenant || code === tenant.currency) return;
    confirm({
      title: "Change currency?",
      message: `Change ${tenant.name}'s currency to ${code}? Amounts already recorded are not converted — only new display formatting changes.`,
      confirmLabel: "Change",
      onConfirm: () => {
        setNotice(null);
        updateTenant.mutate({ id, data: { currency: code } }, {
          onSuccess: () => setNotice({ kind: "success", text: `Currency changed to ${code}` }),
          onError: () => setNotice({ kind: "error", text: "Failed to change currency" }),
        });
      },
    });
  };

  const toggleVat = () => {
    if (!tenant) return;
    const next = !tenant.vat_enabled;
    setNotice(null);
    updateTenant.mutate({ id, data: { vat_enabled: next } }, {
      onSuccess: () => setNotice({ kind: "success", text: `VAT ${next ? "enabled" : "disabled"} for ${tenant.name}` }),
      onError: () => setNotice({ kind: "error", text: "Failed to update VAT" }),
    });
  };

  const openInvite = () => {
    setNotice(null);
    setTempPassword(null);
    setCopied(false);
    setShowInvite(true);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteUser.mutate({ tenantId: id, data: inviteForm }, {
      onSuccess: (res) => {
        setInviteForm({ email: "", full_name: "", role: "member", password: "" });
        setTempPassword(res.data?.temp_password ?? null);
        setNotice({ kind: "success", text: "User invited" });
      },
      onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to invite user" }),
    });
  };

  const handleRemoveUser = (u: { id: string; full_name: string }) => {
    confirm({
      title: "Remove user?",
      message: `Remove ${u.full_name} from this tenant? They will lose access immediately.`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => {
        deleteUser.mutate({ tenantId: id, userId: u.id }, {
          onSuccess: () => setNotice({ kind: "success", text: "User removed" }),
          onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to remove user" }),
        });
      },
    });
  };

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    createDepartment.mutate({ tenantId: id, data: deptForm }, {
      onSuccess: () => {
        setShowAddDept(false);
        setDeptForm({ name: "", description: "" });
        setNotice({ kind: "success", text: "Department created" });
      },
      onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to create department" }),
    });
  };

  const handleRemoveDepartment = (d: { id: string; name: string }) => {
    confirm({
      title: "Delete department?",
      message: `Delete department "${d.name}"?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        deleteDepartment.mutate({ tenantId: id, departmentId: d.id }, {
          onSuccess: () => setNotice({ kind: "success", text: "Department deleted" }),
          onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to delete department" }),
        });
      },
    });
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    createRole.mutate({ tenantId: id, data: roleForm }, {
      onSuccess: () => {
        setShowAddRole(false);
        setRoleForm({ name: "", description: "" });
        setNotice({ kind: "success", text: "Role created" });
      },
      onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to create role" }),
    });
  };

  const handleRemoveRole = (r: { id: string; name: string }) => {
    confirm({
      title: "Delete role?",
      message: `Delete role "${r.name}"?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        deleteRole.mutate({ tenantId: id, roleId: r.id }, {
          onSuccess: () => setNotice({ kind: "success", text: "Role deleted" }),
          onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to delete role" }),
        });
      },
    });
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    createBranch.mutate({ tenantId: id, data: branchForm }, {
      onSuccess: () => {
        setShowAddBranch(false);
        setBranchForm({ name: "", location: "" });
        setNotice({ kind: "success", text: "Branch created" });
      },
      onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to create branch" }),
    });
  };

  const handleRemoveBranch = (b: { id: string; name: string }) => {
    confirm({
      title: "Delete branch?",
      message: `Delete branch "${b.name}"?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        deleteBranch.mutate({ tenantId: id, branchId: b.id }, {
          onSuccess: () => setNotice({ kind: "success", text: "Branch deleted" }),
          onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to delete branch" }),
        });
      },
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
      onError: (err: unknown) => setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Failed to reset password" }),
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

  const openResetData = () => {
    setResetConfirmName("");
    setResetResult(null);
    setResetError(null);
    setShowResetData(true);
  };

  const closeResetData = () => {
    setShowResetData(false);
    setResetConfirmName("");
    setResetResult(null);
    setResetError(null);
  };

  const handleResetData = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || resetConfirmName.trim() !== tenant.name) return;
    setResetError(null);
    resetTenantData.mutate({ id, confirmName: resetConfirmName.trim() }, {
      onSuccess: (res) => setResetResult(res.data?.deleted ?? {}),
      onError: (err: unknown) => setResetError((err as { detail?: string })?.detail ?? "Failed to reset business data"),
    });
  };

  if (loading) return <PageLoader />;

  if (coreError || !tenant) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{coreError ? "Failed to load tenant" : "Tenant not found"}</div>
    </div>
  );

  // fmtMoney's default symbol comes from the logged-in super admin's own
  // session currency, not this tenant's — on this page it must always be
  // *this* tenant's currency, or Revenue shows the wrong symbol whenever an
  // admin (or one with no tenant, defaulting to RWF) views a business on a
  // different currency, same as the currency picker just above it does.
  const tenantCurrencySymbol = currencies.find((cur) => cur.code === tenant.currency)?.symbol ?? tenant.currency;

  const statCards = stats ? [
    { label: "Users",            value: stats.users,                          icon: Users,        color: c.primary },
    { label: "Total Orders",     value: stats.orders,                         icon: ShoppingCart, color: c.blue },
    { label: "Completed Orders", value: stats.completed_orders,               icon: CheckCircle,  color: c.income },
    { label: "Products",         value: stats.products,                       icon: Package,      color: c.gold },
    { label: "Revenue",          value: fmtMoney(stats.revenue, tenantCurrencySymbol), isStr: true, icon: TrendingUp, color: c.profit },
  ] : [];

  const PLAN_COLORS: Record<string, string> = {
    free: "text-muted", starter: "text-blue-600 dark:text-blue-400", professional: "text-violet-600 dark:text-violet-400", enterprise: "text-amber-600 dark:text-amber-400",
  };

  const sections: SectionItem[] = [
    { key: "features", label: "Features & Access", icon: SlidersHorizontal, color: "#0284c7" },
    { key: "users", label: "Users", count: users.length, icon: Users, color: "#7c3aed" },
    { key: "departments", label: "Departments", count: departments.length, icon: Layers, color: "#0f766e" },
    { key: "roles", label: "Roles", count: roles.length, icon: Shield, color: "#b45309" },
    { key: "branches", label: "Branches", count: branches.length, icon: Building2, color: "#059669" },
  ];

  return (
    <div className="space-y-6">
      {confirmDialog}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/tenants" className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground hover:bg-border transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{tenant.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${tenant.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : tenant.subscription_status === "pending" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                {tenantStatusLabel(tenant)}
              </span>
              <span className={`text-[11px] font-semibold capitalize ${PLAN_COLORS[tenant.subscription_plan] ?? "text-muted"}`}>
                {tenant.subscription_plan}
              </span>
            </div>
            <p className="text-sm text-muted mt-0.5 font-mono">{tenant.slug} {tenant.city && `· ${tenant.city}`} {tenant.country && `· ${tenant.country}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openInvite}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus size={14} /> Invite User
          </button>
          <Select
            value={tenant.currency}
            disabled={updateTenant.isPending}
            onChange={(e) => changeCurrency(e.target.value)}
            className="w-auto! text-sm font-semibold"
            aria-label="Tenant currency"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.code} &middot; {c.name}</option>
            ))}
          </Select>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border">
            <Toggle
              checked={tenant.vat_enabled}
              onChange={toggleVat}
              disabled={updateTenant.isPending}
              size="sm"
              label={tenant.vat_enabled ? `Disable VAT for ${tenant.name}` : `Enable VAT for ${tenant.name}`}
            />
            <span className="text-sm font-medium text-foreground">
              VAT {tenant.vat_enabled ? "on" : "off"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border">
            <Toggle
              checked={tenant.is_active}
              onChange={toggleStatus}
              loading={acting}
              size="sm"
              label={tenant.is_active ? `Suspend ${tenant.name}` : `${tenant.subscription_status === "pending" ? "Approve" : "Activate"} ${tenant.name}`}
            />
            <span className="text-sm font-medium text-foreground">
              {tenantStatusLabel(tenant)}
            </span>
          </div>
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

      {/* Business information — everything on file for this tenant: contact
          details (from Settings) plus what they told us at signup. Read-only
          here; the tenant themselves edits this from their own Settings page. */}
      {(tenant.logo_url || tenant.phone || tenant.address || tenant.city || tenant.country || tenant.website ||
        tenant.business_type || tenant.industry || tenant.business_category || tenant.employee_count ||
        tenant.business_location || tenant.heard_about || tenant.referral_code) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveUploadUrl(tenant.logo_url) ?? undefined}
                alt={tenant.name}
                className="w-11 h-11 rounded-xl object-cover border border-border flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent font-bold flex-shrink-0">
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <h2 className="text-sm font-bold text-foreground">Business Information</h2>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
            {[
              { label: "Phone", value: tenant.phone },
              { label: "Address", value: tenant.address },
              { label: "City", value: tenant.city },
              { label: "Country", value: tenant.country },
              {
                label: "Website",
                value: tenant.website,
                render: tenant.website && (
                  <a href={tenant.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {tenant.website}
                  </a>
                ),
              },
              { label: "Business Type", value: BUSINESS_TYPE_LABELS[tenant.business_type ?? ""] ?? tenant.business_type },
              { label: "Industry", value: tenant.industry },
              { label: "Category", value: tenant.business_category },
              { label: "Employees", value: tenant.employee_count },
              { label: "Location", value: tenant.business_location },
              { label: "Heard About Us", value: tenant.heard_about },
              { label: "Referral Code", value: tenant.referral_code },
            ].filter((row) => row.value).map((row) => (
              <div key={row.label}>
                <dt className="text-[11px] text-muted">{row.label}</dt>
                <dd className="text-sm font-medium text-foreground mt-0.5 truncate">{row.render ?? row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {notice && (
        <div className={`flex items-center justify-between gap-3 text-sm rounded-xl px-4 py-3 border ${
          notice.kind === "error"
            ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20"
            : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        }`}>
          <span className="flex items-center gap-2">
            {notice.kind === "error" ? <XCircle size={14} /> : <CheckCircle size={14} />}
            {notice.text}
          </span>
          <button onClick={() => setNotice(null)} className="text-muted hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* Section nav + panels */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <nav className="lg:w-44 lg:flex-shrink-0">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 lg:flex-col lg:gap-1 lg:mx-0 lg:px-0 lg:pb-0 lg:overflow-x-visible lg:sticky lg:top-24">
            {sections.map((s) => {
              const active = tab === s.key;
              const color = s.color ?? "#0284c7";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setTab(s.key as Tab)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 lg:flex-shrink ${
                    active ? "text-white shadow-sm" : "text-muted hover:bg-surface/70 hover:text-foreground"
                  }`}
                  style={active ? { backgroundColor: color } : undefined}
                >
                  <s.icon size={15} strokeWidth={active ? 2.2 : 1.8} style={{ color: active ? "#fff" : color }} className="flex-shrink-0" />
                  <span className="lg:truncate">{s.label}</span>
                  {typeof s.count === "number" && (
                    <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-md ${active ? "bg-white/20 text-white" : "bg-surface text-muted"}`}>
                      {s.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="flex-1 min-w-0 space-y-6">
          {/* Features & Access panel */}
          {tab === "features" && <FeaturesPanel tenantId={id} />}

      {/* Users panel */}
      {tab === "users" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Users ({users.length})</h2>
            <button onClick={openInvite} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline transition-colors">
              <UserPlus size={13} /> Invite
            </button>
          </div>
          {bulkUsers.count > 0 && (
            <div className="px-5 py-3 border-b border-border">
              <BulkActionBar count={bulkUsers.count} label="user" onDelete={confirmBulkDeleteUsers} onClear={bulkUsers.clear} deleting={bulkDeleting} />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider">
                  <th className="px-5 py-3 w-10">
                    <input type="checkbox" checked={bulkUsers.allSelected} ref={(el) => { if (el) el.indeterminate = bulkUsers.someSelected; }} onChange={bulkUsers.toggleAll} className="w-4 h-4 rounded" disabled={removableUserIds.length === 0} />
                  </th>
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
                      {!u.is_superuser && (
                        <input type="checkbox" checked={bulkUsers.selected.has(u.id)} onChange={() => bulkUsers.toggle(u.id)} className="w-4 h-4 rounded" />
                      )}
                    </td>
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
                            disabled={resetPassword.isPending && resetPassword.variables?.userId === u.id}
                            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50"
                          >
                            {resetPassword.isPending && resetPassword.variables?.userId === u.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <KeyRound size={13} />} Reset
                          </button>
                        )}
                        {!u.is_superuser && (
                          <button
                            onClick={() => handleRemoveUser(u)}
                            disabled={deleteUser.isPending && deleteUser.variables?.userId === u.id}
                            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50"
                          >
                            {deleteUser.isPending && deleteUser.variables?.userId === u.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />} Remove
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
            <div className="py-12 text-center">
              <Users size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No users yet</p>
              <button onClick={openInvite} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[12px] font-semibold transition-colors">
                <UserPlus size={13} /> Invite the first user
              </button>
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
          {deptsError && (
            <div className="px-5 py-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border-b border-red-500/20">Failed to load departments.</div>
          )}
          {departments.length === 0 ? (
            <div className="py-12 text-center">
              <Layers size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No departments yet</p>
              <button onClick={() => setShowAddDept(true)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[12px] font-semibold transition-colors">
                <Plus size={13} /> Add a department
              </button>
            </div>
          ) : (
            <>
              {bulkDepartments.count > 0 && (
                <div className="px-5 py-3 border-b border-border">
                  <BulkActionBar count={bulkDepartments.count} label="department" onDelete={confirmBulkDeleteDepartments} onClear={bulkDepartments.clear} deleting={bulkDeleting} />
                </div>
              )}
            <div className="divide-y divide-border">
              {departments.map((d) => (
                <div key={d.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={bulkDepartments.selected.has(d.id)} onChange={() => bulkDepartments.toggle(d.id)} className="w-4 h-4 rounded shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      {d.description && <p className="text-[11px] text-muted mt-0.5 truncate">{d.description}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveDepartment(d)}
                    disabled={deleteDepartment.isPending && deleteDepartment.variables?.departmentId === d.id}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    {deleteDepartment.isPending && deleteDepartment.variables?.departmentId === d.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />} Delete
                  </button>
                </div>
              ))}
            </div>
            </>
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
          {rolesError && (
            <div className="px-5 py-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border-b border-red-500/20">Failed to load roles.</div>
          )}
          {roles.length === 0 ? (
            <div className="py-12 text-center">
              <Shield size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No roles yet</p>
              <button onClick={() => setShowAddRole(true)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[12px] font-semibold transition-colors">
                <Plus size={13} /> Add a role
              </button>
            </div>
          ) : (
            <>
              {bulkRoles.count > 0 && (
                <div className="px-5 py-3 border-b border-border">
                  <BulkActionBar count={bulkRoles.count} label="role" onDelete={confirmBulkDeleteRoles} onClear={bulkRoles.clear} deleting={bulkDeleting} />
                </div>
              )}
            <div className="divide-y divide-border">
              {roles.map((r) => (
                <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={bulkRoles.selected.has(r.id)} onChange={() => bulkRoles.toggle(r.id)} className="w-4 h-4 rounded shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize">{r.name}</p>
                      {r.description && <p className="text-[11px] text-muted mt-0.5 truncate">{r.description}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveRole(r)}
                    disabled={deleteRole.isPending && deleteRole.variables?.roleId === r.id}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    {deleteRole.isPending && deleteRole.variables?.roleId === r.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />} Delete
                  </button>
                </div>
              ))}
            </div>
            </>
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
          {branchesError && (
            <div className="px-5 py-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border-b border-red-500/20">Failed to load branches.</div>
          )}
          {branches.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No branches yet</p>
              <button onClick={() => setShowAddBranch(true)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[12px] font-semibold transition-colors">
                <Plus size={13} /> Add a branch
              </button>
            </div>
          ) : (
            <>
              {bulkBranches.count > 0 && (
                <div className="px-5 py-3 border-b border-border">
                  <BulkActionBar count={bulkBranches.count} label="branch" pluralLabel="branches" onDelete={confirmBulkDeleteBranches} onClear={bulkBranches.clear} deleting={bulkDeleting} />
                </div>
              )}
            <div className="divide-y divide-border">
              {branches.map((b) => (
                <div key={b.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={bulkBranches.selected.has(b.id)} onChange={() => bulkBranches.toggle(b.id)} className="w-4 h-4 rounded shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{b.name}</p>
                      <p className="text-[11px] text-muted mt-0.5">{b.location || "—"} {b.status && <span className="capitalize ml-1">· {b.status}</span>}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveBranch(b)}
                    disabled={deleteBranch.isPending && deleteBranch.variables?.branchId === b.id}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    {deleteBranch.isPending && deleteBranch.variables?.branchId === b.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />} Delete
                  </button>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-card border border-red-500/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-red-500/20">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-foreground">Reset Business Data</p>
            <p className="text-[12px] text-muted mt-0.5">
              Permanently deletes {tenant.name}&apos;s products, sales, customers, suppliers, expenses, invoices &amp; accounting entries, deals, purchase orders, manufacturing/repair jobs, and inventory &amp; stock — for a business clearing out mistakes made while still testing the platform. The tenant account, user logins, roles, departments, branches, and settings (currency, VAT, branding) are kept, so it reopens clean without redoing setup. This cannot be undone.
            </p>
          </div>
          <button
            onClick={openResetData}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-sm font-semibold transition-colors shrink-0"
          >
            <RotateCcw size={14} /> Reset Business Data
          </button>
        </div>
      </div>

      {/* Invite drawer */}
      <Drawer
        open={showInvite}
        onClose={() => { setShowInvite(false); setTempPassword(null); setCopied(false); }}
        title="Invite User"
        description={`Add a user to ${tenant.name}`}
      >
        {tempPassword === null ? (
          <form onSubmit={handleInvite} className="space-y-4 p-5">
            <Field label="Full Name" required>
              <Input required value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} placeholder="John Doe" />
            </Field>
            <Field label="Email" required>
              <Input type="email" required value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="john@example.com" />
            </Field>
            <Field label="Role">
              <Select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
                {["admin", "member", "viewer"].map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </Select>
            </Field>
            <Field label="Password (optional)">
              <Input
                value={inviteForm.password}
                onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                placeholder="Leave blank to auto-generate"
                minLength={8}
              />
            </Field>
            <p className="text-xs text-muted">
              Set a password here if you&apos;ll share it with the user yourself (min. 8 characters, one number, one uppercase letter). Leave it blank to have a strong one generated automatically — either way it&apos;s emailed to them and shown here once.
            </p>
            <FormFooter submitLabel={inviteUser.isPending ? "Inviting…" : "Invite User"} onCancel={() => setShowInvite(false)} disabled={inviteUser.isPending} />
          </form>
        ) : (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[13px] px-4 py-3">
              User invited. Temporary password shown once — copy it now and share it with them securely (it was also emailed to them).
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
                onClick={() => { setShowInvite(false); setTempPassword(null); setCopied(false); }}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[13px] font-bold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
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

      {/* Reset business data drawer */}
      <Drawer
        open={showResetData}
        onClose={closeResetData}
        side="center"
        size="sm"
        title={resetResult ? "Business Data Reset" : "Reset Business Data"}
        description={resetResult ? undefined : `Wipe ${tenant.name}'s transactional data`}
      >
        {resetResult ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[13px] px-4 py-3">
              <CheckCircle size={14} className="shrink-0" /> Business data reset for {tenant.name}.
            </div>
            {Object.keys(resetResult).length > 0 ? (
              <dl className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {Object.entries(resetResult).map(([label, count]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2 text-sm">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-semibold text-foreground">{count.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">There was no data to delete.</p>
            )}
            <div className="flex justify-end pt-2">
              <button
                onClick={closeResetData}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-[13px] font-bold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetData} className="p-5 space-y-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-[13px] px-4 py-3 space-y-1.5">
              <p className="font-semibold">This cannot be undone.</p>
              <p>Wipes: products, orders/sales, customers, suppliers, expenses, invoices &amp; accounting entries, deals, purchase orders, manufacturing/repair jobs, and inventory &amp; stock.</p>
              <p>Kept: the tenant account, user logins, roles, departments, branches, and settings (currency, VAT, branding).</p>
            </div>
            <Field label={`Type "${tenant.name}" to confirm`} required>
              <Input
                required
                autoFocus
                value={resetConfirmName}
                onChange={(e) => setResetConfirmName(e.target.value)}
                placeholder={tenant.name}
              />
            </Field>
            {resetError && <p className="text-xs text-red-600 dark:text-red-400">{resetError}</p>}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeResetData}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetTenantData.isPending || resetConfirmName.trim() !== tenant.name}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetTenantData.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Reset Business Data
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
