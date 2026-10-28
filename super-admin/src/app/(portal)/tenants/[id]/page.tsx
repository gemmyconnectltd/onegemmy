"use client";
import { SubscriptionManager, LiveBillingList } from "@/components/billing/LiveBilling";
import { COUNTRY_NAMES } from "@/lib/countries";
import { TableScroll } from "@/components/ui/TableScroll";
import { useState } from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Users, UserPlus, Loader2,
  CheckCircle, XCircle, Building2, Layers, Shield,
  Plus, Trash2, X, KeyRound, Copy, Check,
  AlertTriangle, RotateCcw, Eye, Crown, Power,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useTenant, useTenantStats, useTenantUsers, useActivateTenant,
  useInviteUser, useDeleteUser, useTenantDepartments, useCreateDepartment,
  useDeleteDepartment, useTenantRoles, useCreateRole, useDeleteRole,
  useTenantBranches, useCreateBranch, useDeleteBranch, useResetUserPassword,
  useUpdateTenant, useResetTenantData, useTenantLimits, usePlatformAuditLogs,
} from "@/lib/api/hooks";
import { tenantStatusLabel } from "@/lib/api/admin";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import Link from "next/link";
import FeaturesPanel from "./FeaturesPanel";
import { Button } from "@/components/ui/Button";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";
import { ActionMenu } from "@/components/tenants/ActionMenu";
import { ContactBadge } from "@/components/tenants/ContactBadge";
import { TenantLogo, TenantStatusBadge } from "@/components/tenants/StatusBadge";
import { OperationsPanel } from "./TenantOperations";
import { ActivityPanel, OverviewPanel, SecurityPanel, UsagePanel, type PanelTab } from "./TenantPanels";
import { resolveUploadUrl } from "@/lib/api/client";


function TenantDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currencies } = useAppConfig();

  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PanelTab>(() => {
    const t = searchParams.get("tab");
    return (["overview", "users", "branches", "subscription", "usage", "invoices", "security", "activity", "operations"] as const).find((x) => x === t) ?? "overview";
  });
  const [usersSub, setUsersSub] = useState<"users" | "departments" | "roles">("users");
  const [editForm, setEditForm] = useState<{ name: string; slug: string; phone: string; city: string; country: string; preferred_contact: "email" | "phone" | "whatsapp" | "all" } | null>(null);
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
  const { data: stats } = useTenantStats(id);
  const { data: usersData, isError: usersError } = useTenantUsers(id);
  const { data: departmentsData, isError: deptsError } = useTenantDepartments(id);
  const { data: rolesData, isError: rolesError } = useTenantRoles(id);
  const { data: branchesData, isError: branchesError } = useTenantBranches(id);
  const { data: limits } = useTenantLimits(id);
  const audit = usePlatformAuditLogs(1, 100);
  const tenantEvents = (audit.data?.items ?? []).filter((e) => e.tenant_id === id || e.entity_id === id);

  const users = usersData?.items ?? [];
  const departments = departmentsData?.items ?? [];
  const roles = rolesData?.items ?? [];
  const branches = branchesData?.items ?? [];

  const loading = tenantLoading;
  // Only the tenant itself is essential: stats/users/branches failing must not hide the whole page.
  const coreError = tenantError;

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

  // Suspending needs a reason and a typed confirmation (Operations tab); reactivating does not.
  const toggleStatus = () => {
    if (!tenant) return;
    if (tenant.is_active) { setTab("operations"); return; }
    setActing(true);
    setNotice(null);
    activateTenant.mutate({ id }, {
      onSuccess: () => setNotice({ kind: "success", text: "Business reactivated" }),
      onError: () => setNotice({ kind: "error", text: "Failed to update status" }),
      onSettled: () => setActing(false),
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

  const toggleMultiBranch = () => {
    if (!tenant) return;
    const next = !tenant.multi_branch;
    setNotice(null);
    updateTenant.mutate({ id, data: { multi_branch: next } }, {
      onSuccess: () => setNotice({ kind: "success", text: `Multi-branch ${next ? "enabled" : "disabled"} for ${tenant.name}` }),
      onError: () => setNotice({ kind: "error", text: "Failed to update multi-branch" }),
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
    inviteUser.mutate({ tenantId: id, data: { ...inviteForm, full_name: inviteForm.full_name.trim(), email: inviteForm.email.trim() } }, {
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
      onSuccess: () => { setNotice({ kind: "success", text: `Recovery link emailed to ${resetUser.full_name}. It expires in 30 minutes.` }); setResetUser(null); },
      onError: (err: unknown) => { setNotice({ kind: "error", text: (err as { detail?: string })?.detail ?? "Could not send the recovery link" }); setResetUser(null); },
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

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={tenant.currency} disabled={updateTenant.isPending} onChange={(e) => changeCurrency(e.target.value)} className="w-auto! text-sm font-semibold" aria-label="Tenant currency">
        {currencies.map((cur) => (<option key={cur.code} value={cur.code}>{cur.code} &middot; {cur.name}</option>))}
      </Select>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Toggle checked={tenant.vat_enabled} onChange={toggleVat} disabled={updateTenant.isPending} size="sm" label={tenant.vat_enabled ? `Disable VAT for ${tenant.name}` : `Enable VAT for ${tenant.name}`} />
        <span className="text-sm font-medium text-foreground">VAT {tenant.vat_enabled ? "on" : "off"}</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Toggle checked={tenant.multi_branch ?? false} onChange={toggleMultiBranch} disabled={updateTenant.isPending} size="sm" label={tenant.multi_branch ? `Disable multi-branch for ${tenant.name}` : `Enable multi-branch for ${tenant.name}`} />
        <span className="text-sm font-medium text-foreground">Multi-branch {tenant.multi_branch ? "on" : "off"}</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Toggle checked={tenant.is_active} onChange={toggleStatus} loading={acting} size="sm" label={tenant.is_active ? `Suspend ${tenant.name}` : `${tenant.subscription_status === "pending" ? "Approve" : "Activate"} ${tenant.name}`} />
        <span className="text-sm font-medium text-foreground">{tenantStatusLabel(tenant)}</span>
      </div>
    </div>
  );
  const panelProps = { tenant, stats, limits, branches, usersCount: users.length, go: setTab };
  const TABS: { key: PanelTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" }, { key: "users", label: "Users", count: users.length }, { key: "branches", label: "Branches", count: branches.length },
    { key: "subscription", label: "Subscription" }, { key: "usage", label: "Usage" }, { key: "invoices", label: "Invoices" }, { key: "security", label: "Security" }, { key: "activity", label: "Activity" }, { key: "operations", label: "Actions" },
  ];

  return (
    <div className="space-y-5">
      {confirmDialog}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/tenants" aria-label="Back to Tenants" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-muted transition-colors hover:bg-border hover:text-foreground"><ArrowLeft size={15} /></Link>
          <TenantLogo name={tenant.name} src={resolveUploadUrl(tenant.logo_url)} size={44} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{tenant.name}</h1><TenantStatusBadge tenant={tenant} /><ContactBadge value={tenant.preferred_contact} /></div>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{[tenant.country, tenant.slug, tenant.created_at ? `Registered ${new Date(tenant.created_at).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled title="Secure, time-limited, audited impersonation isn't available yet — nothing is faked here."><Eye size={14} /> View as Tenant</Button>
          <Button variant="outline" onClick={() => setTab("subscription")}><Crown size={14} /> Change Plan</Button>
          <Button variant="primary" type="button" onClick={openInvite}><UserPlus size={14} /> Invite User</Button>
          <ActionMenu label="More actions" items={[
                      { label: "Edit business", icon: <Building2 size={14} />, onSelect: () => setEditForm({ name: tenant.name.trim(), slug: tenant.slug, phone: tenant.phone ?? "", city: tenant.city ?? "", country: tenant.country ?? "", preferred_contact: tenant.preferred_contact ?? "email" }) },
            { label: tenant.is_active ? "Suspend business…" : "Activate business", disabled: !!tenant.archived_at, icon: <Power size={14} />, danger: tenant.is_active, onSelect: toggleStatus },
            { label: "Reset business data", icon: <RotateCcw size={14} />, danger: true, onSelect: openResetData },
          ]} />
        </div>
      </div>

      {notice && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
          <span className="flex items-center gap-2">{notice.kind === "error" ? <XCircle size={14} /> : <CheckCircle size={14} />}{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted transition-colors hover:text-foreground"><X size={14} /></button>
        </div>
      )}

      {/* Tabs */}
      <SectionLayout nav={<SecondaryNav label="Tenant sections" title="Manage business" items={TABS.map((t) => ({ key: t.key, label: t.label, count: t.count, active: tab === t.key, onSelect: () => setTab(t.key) }))} />}>
      <div>
        <div className="min-w-0 space-y-6">
          {tab === "overview" && <OverviewPanel {...panelProps} controls={controls} />}
          {tab === "subscription" && <><SubscriptionManager tenantId={id} /><FeaturesPanel tenantId={id} /></>}
          {tab === "usage" && <UsagePanel {...panelProps} currencySymbol={tenantCurrencySymbol} />}
          {tab === "invoices" && <LiveBillingList kind="invoices" tenantId={id} />}
          {tab === "security" && <SecurityPanel tenant={tenant} usersCount={users.length} inactiveUsers={users.filter((u) => !u.is_active).length} events={tenantEvents} eventsLoading={audit.isLoading} />}
          {tab === "operations" && <OperationsPanel tenant={tenant} users={users} />}
          {tab === "activity" && <ActivityPanel events={tenantEvents} loading={audit.isLoading} error={audit.isError} scanned={audit.data?.items.length ?? 0} />}
          {tab === "users" && (
            <div role="group" aria-label="User management" className="flex gap-1 rounded-lg border border-border bg-surface p-1 text-[12.5px] font-semibold sm:w-fit">
              {([["users", "Users", users.length], ["departments", "Departments", departments.length], ["roles", "Roles", roles.length]] as const).map(([k, label, n]) => (
                <button key={k} type="button" aria-pressed={usersSub === k} onClick={() => setUsersSub(k)} className={`flex-1 rounded-md px-3 py-1.5 sm:flex-none ${usersSub === k ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>{label} <span className="text-muted">{n}</span></button>
              ))}
            </div>
          )}

      {/* Users panel */}
      {tab === "users" && usersError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={15} /> Could not load the users for this business (the server returned an error).</div>
      )}
      {tab === "users" && usersSub === "users" && (
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
            <TableScroll><table className="w-full min-w-[640px]">
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
                          <Button variant="secondary" size="sm"
                            onClick={() => handleResetPassword(u)}
                            disabled={resetPassword.isPending && resetPassword.variables?.userId === u.id}
                          >
                            {resetPassword.isPending && resetPassword.variables?.userId === u.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <KeyRound size={13} />} Reset
                          </Button>
                        )}
                        {!u.is_superuser && (
                          <Button variant="danger" size="sm"
                            onClick={() => handleRemoveUser(u)}
                            disabled={deleteUser.isPending && deleteUser.variables?.userId === u.id}
                          >
                            {deleteUser.isPending && deleteUser.variables?.userId === u.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />} Remove
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></TableScroll>
          </div>
          {users.length === 0 && (
            <div className="py-12 text-center">
              <Users size={28} className="text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-muted">No users yet</p>
              <Button variant="primary" onClick={openInvite}>
                <UserPlus size={13} /> Invite the first user
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Departments panel */}
      {tab === "users" && usersSub === "departments" && (
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
              <Button variant="primary" size="sm" onClick={() => setShowAddDept(true)}>
                <Plus size={13} /> Add a department
              </Button>
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
                <div key={d.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={bulkDepartments.selected.has(d.id)} onChange={() => bulkDepartments.toggle(d.id)} className="w-4 h-4 rounded shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      {d.description && <p className="text-[11px] text-muted mt-0.5 truncate">{d.description}</p>}
                    </div>
                  </div>
                  <Button variant="danger" size="sm"
                    onClick={() => handleRemoveDepartment(d)}
                    disabled={deleteDepartment.isPending && deleteDepartment.variables?.departmentId === d.id}
                  >
                    {deleteDepartment.isPending && deleteDepartment.variables?.departmentId === d.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />} Delete
                  </Button>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* Roles panel */}
      {tab === "users" && usersSub === "roles" && (
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
              <Button variant="primary" size="sm" onClick={() => setShowAddRole(true)}>
                <Plus size={13} /> Add a role
              </Button>
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
                <div key={r.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={bulkRoles.selected.has(r.id)} onChange={() => bulkRoles.toggle(r.id)} className="w-4 h-4 rounded shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize">{r.name}</p>
                      {r.description && <p className="text-[11px] text-muted mt-0.5 truncate">{r.description}</p>}
                    </div>
                  </div>
                  <Button variant="danger" size="sm"
                    onClick={() => handleRemoveRole(r)}
                    disabled={deleteRole.isPending && deleteRole.variables?.roleId === r.id}
                  >
                    {deleteRole.isPending && deleteRole.variables?.roleId === r.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />} Delete
                  </Button>
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
              <Button variant="primary" size="sm" onClick={() => setShowAddBranch(true)}>
                <Plus size={13} /> Add a branch
              </Button>
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
                <div key={b.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-surface/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={bulkBranches.selected.has(b.id)} onChange={() => bulkBranches.toggle(b.id)} className="w-4 h-4 rounded shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{b.name}</p>
                      <p className="text-[11px] text-muted mt-0.5">{b.location || "—"} {b.status && <span className="capitalize ml-1">· {b.status}</span>}</p>
                    </div>
                  </div>
                  <Button variant="danger" size="sm"
                    onClick={() => handleRemoveBranch(b)}
                    disabled={deleteBranch.isPending && deleteBranch.variables?.branchId === b.id}
                  >
                    {deleteBranch.isPending && deleteBranch.variables?.branchId === b.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />} Delete
                  </Button>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}
        </div>
      </div>

      {tab === "overview" && (
      <div className="bg-card border border-red-500/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 py-3"><div><p className="text-sm font-semibold">Archive business</p><p className="text-xs text-muted">Needs a reason, the typed business name and a second administrator&apos;s approval. Records are always retained.</p></div><Button variant="outline" onClick={() => setTab("operations")}>Go to Actions</Button></div>
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
      )}
      </SectionLayout>

      {editForm && <Drawer open onClose={() => setEditForm(null)} title="Edit business"><form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); updateTenant.mutate({ id, data: { ...editForm, name: editForm.name.trim(), slug: editForm.slug.trim(), phone: editForm.phone.trim(), city: editForm.city.trim(), country: editForm.country.trim() } }, { onSuccess: () => setEditForm(null), onError: () => setNotice({ kind: "error", text: "Could not save business details" }) }); }}>
        {(["name", "slug", "phone", "city"] as const).map(k => <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} required={k === "name" || k === "slug"}><Input required={k === "name" || k === "slug"} value={editForm[k]} onChange={e => setEditForm({ ...editForm, [k]: e.target.value })} /></Field>)}
        <Field label="Country"><Select value={editForm.country} onChange={e => setEditForm({ ...editForm, country: e.target.value })}><option value="">Not specified</option>{COUNTRY_NAMES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Contact preference"><Select value={editForm.preferred_contact} onChange={e => setEditForm({ ...editForm, preferred_contact: e.target.value as typeof editForm.preferred_contact })}><option value="whatsapp">WhatsApp</option><option value="phone">Phone call</option><option value="email">Email</option><option value="all">All</option></Select></Field>
        <FormFooter submitLabel="Save changes" onCancel={() => setEditForm(null)} disabled={updateTenant.isPending} /></form></Drawer>}
      {/* Change plan drawer */}
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
                {["owner", "admin", "member", "viewer"].map((r) => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
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
              <Button variant="secondary" size="sm"
                onClick={copyPassword}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary"
                onClick={() => { setShowInvite(false); setTempPassword(null); setCopied(false); }}
              >
                Done
              </Button>
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

      {/* Account recovery drawer */}
      <Drawer open={!!resetUser} onClose={() => setResetUser(null)} title="Send recovery link" description={resetUser ? `Help ${resetUser.full_name} regain access` : ""}>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">We email {resetUser?.full_name} a link to choose a new password. It expires in 30 minutes. You will never see their password or the link, and the action is recorded in the audit log.</p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button variant="primary" onClick={confirmResetPassword} disabled={resetPassword.isPending}>{resetPassword.isPending ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}Email recovery link</Button>
          </div>
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
              <Button variant="primary"
                onClick={closeResetData}
              >
                Done
              </Button>
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

export default function TenantDetailPage() {
  return <Suspense fallback={<PageLoader />}><TenantDetailPageInner /></Suspense>;
}
