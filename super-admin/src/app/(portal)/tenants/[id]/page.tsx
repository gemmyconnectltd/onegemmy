"use client";
import { SubscriptionManager, LiveBillingList } from "@/components/billing/LiveBilling";
import { COUNTRY_NAMES } from "@/lib/countries";
import { useState } from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, UserPlus, Loader2,
  CheckCircle, XCircle, Building2, Layers, Shield,
  Plus, Trash2, X, 
  AlertTriangle, Crown, Power,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useTenant, useTenantStats, useTenantUsers, useActivateTenant,
  useTenantDepartments, useCreateDepartment,
  useDeleteDepartment, useTenantRoles, useCreateRole, useDeleteRole,
  useTenantBranches, useCreateBranch, useDeleteBranch,
  useUpdateTenant, useTenantLimits, useTenantRecords,
} from "@/lib/api/hooks";
import { tenantStatusLabel } from "@/lib/api/admin";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import FeaturesPanel from "./FeaturesPanel";
import UserFeatureAccess from "./UserFeatureAccess";
import InviteBusinessUser from "./InviteBusinessUser";
import { RolePermissionManager } from "./EmployeePermissions";
import { Button } from "@/components/ui/Button";
import { BusinessShell, SubTabs } from "@/components/business/BusinessShell";
import { ControlCenter } from "@/components/business/ControlCenter";
import { LocationsPanel } from "@/components/business/LocationsPanel";
import { ProfileTab } from "@/components/business/ProfileTab";
import { ActionMenu } from "@/components/tenants/ActionMenu";
import { SecurityPanel, UsagePanel, type PanelTab } from "./TenantPanels";
import { TenantRecords } from "./TenantRecords";

const PANEL_TABS: readonly PanelTab[] = [
  "overview", "profile", "records", "users", "user-access", "branches", "subscription",
  "usage", "invoices", "modules", "approvals", "activity", "security", "operations",
];

type BusinessProfileDraft = {
  name: string;
  slug: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  website: string;
  business_type: string;
  industry: string;
  business_category: string;
  employee_count: string;
  business_location: string;
  heard_about: string;
  preferred_contact: "email" | "phone" | "whatsapp" | "all";
};

function TenantDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currencies } = useAppConfig();

  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const searchParams = useSearchParams();
  const tab = PANEL_TABS.find((key) => key === searchParams.get("tab")) ?? "overview";
  const selectTab = (next: PanelTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/tenants/${encodeURIComponent(id)}?${params.toString()}`, { scroll: false });
  };
  const [usersSub, setUsersSub] = useState<"users" | "departments" | "roles">("users");
  const [editForm, setEditForm] = useState<BusinessProfileDraft | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [permissionRole,setPermissionRole] = useState<string | null>(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);

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
  const audit = useTenantRecords(id, "activity");
  const tenantEvents = audit.data?.items ?? [];

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
  const createDepartment = useCreateDepartment();
  const deleteDepartment = useDeleteDepartment();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();

  const bulkDepartments = useBulkSelection(departments.map((d) => d.id));
  const bulkRoles = useBulkSelection(roles.map((r) => r.id));
  const bulkBranches = useBulkSelection(branches.map((b) => b.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
    if (tenant.is_active) { selectTab("operations"); return; }
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
    setShowInvite(true);
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

  const openEditProfile = () => setEditForm({
    name: tenant.name.trim(),
    slug: tenant.slug,
    phone: tenant.phone ?? "",
    address: tenant.address ?? "",
    city: tenant.city ?? "",
    country: tenant.country ?? "",
    website: tenant.website ?? "",
    business_type: tenant.business_type ?? "",
    industry: tenant.industry ?? "",
    business_category: tenant.business_category ?? "",
    employee_count: tenant.employee_count ?? "",
    business_location: tenant.business_location ?? "",
    heard_about: tenant.heard_about ?? "",
    preferred_contact: tenant.preferred_contact ?? "email",
  });

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
  const panelProps = { tenant, stats, limits, branches, usersCount: users.length, go: selectTab };

  return (
    <div className="space-y-5">
      {confirmDialog}

      <BusinessShell tenant={tenant} panel={tab}
        actions={
        <>
          <Button variant="outline" onClick={() => selectTab("subscription")}><Crown size={14} /> Change Plan</Button>
          <Button variant="primary" type="button" onClick={openInvite}><UserPlus size={14} /> Invite User</Button>
          <ActionMenu label="More actions" items={[
            { label: "Edit business profile", icon: <Building2 size={14} />, onSelect: openEditProfile },
            { label: tenant.is_active ? "Suspend business…" : "Activate business", disabled: !!tenant.archived_at, icon: <Power size={14} />, danger: tenant.is_active, onSelect: toggleStatus },
          ]} />
        </>
        }
        notice={notice ? (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
          <span className="flex items-center gap-2">{notice.kind === "error" ? <XCircle size={14} /> : <CheckCircle size={14} />}{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted transition-colors hover:text-foreground"><X size={14} /></button>
        </div>
      ) : null}>
      <div>
        <div className="min-w-0 space-y-6">
          {tab === "user-access" && <UserFeatureAccess tenantId={id} />}
          {tab === "overview" && <ControlCenter tenant={tenant} stats={stats} limits={limits} branches={branches} usersCount={users.length} events={tenantEvents} />}
          {(tab === "profile" || tab === "operations") && <ProfileTab tenant={tenant} users={users} controls={controls} events={tenantEvents} onEdit={openEditProfile} />}
          {["subscription", "usage", "invoices"].includes(tab) && <SubTabs label="Subscription and billing" active={tab} onSelect={(k) => selectTab(k as PanelTab)} items={[{ key: "subscription", label: "Subscription" }, { key: "usage", label: "Usage" }, { key: "invoices", label: "Invoices" }]} />}
          {tab === "records" && <TenantRecords tenantId={id} currency={tenant.currency} />}
          {tab === "subscription" && <SubscriptionManager tenantId={id} />}
          {tab === "modules" && <FeaturesPanel tenantId={id} />}
          {tab === "usage" && <UsagePanel {...panelProps} currencySymbol={tenantCurrencySymbol} />}
          {tab === "invoices" && <LiveBillingList kind="invoices" tenantId={id} />}
          {tab === "approvals" && <TenantRecords tenantId={id} currency={tenant.currency} initialSection="approvals" />}
          {tab === "security" && <SecurityPanel tenant={tenant} usersCount={users.length} inactiveUsers={users.filter((u) => !u.is_active).length} events={tenantEvents} eventsLoading={audit.isLoading} />}
          {tab === "activity" && <TenantRecords tenantId={id} currency={tenant.currency} initialSection="activity" />}
          {(tab === "users" || tab === "user-access") && (
            <SubTabs label="User management" active={tab === "user-access" ? "access" : usersSub}
              onSelect={(k) => { if (k === "access") selectTab("user-access"); else { setUsersSub(k as typeof usersSub); if (tab !== "users") selectTab("users"); } }}
              items={[{ key: "users", label: "Users", count: users.length }, { key: "departments", label: "Departments", count: departments.length }, { key: "roles", label: "Roles", count: roles.length }, { key: "access", label: "Team access" }]} />
          )}

      {/* Users panel */}
      {tab === "users" && usersError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={15} /> Could not load the users for this business (the server returned an error).</div>
      )}
      {tab === "users" && usersSub === "users" && <UserFeatureAccess tenantId={id} onInvite={openInvite} />}

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
                  <Button variant="outline" size="sm" onClick={() => setPermissionRole(r.id)}>Permissions</Button>
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

      {/* Branches & warehouses panel */}
      {tab === "branches" && (
        <>
          {branchesError && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">Failed to load branches.</div>}
          {bulkBranches.count > 0 && <BulkActionBar count={bulkBranches.count} label="branch" pluralLabel="branches" onDelete={confirmBulkDeleteBranches} onClear={bulkBranches.clear} deleting={bulkDeleting} />}
          <LocationsPanel tenant={tenant} onAddBranch={() => setShowAddBranch(true)} bulk={{ selected: bulkBranches.selected, toggle: bulkBranches.toggle }}
            deletingId={deleteBranch.isPending ? deleteBranch.variables?.branchId ?? null : null} onDeleteBranch={(branchId, name) => handleRemoveBranch({ id: branchId, name } as (typeof branches)[number])} />
        </>
      )}
        </div>
      </div>

      </BusinessShell>

      {editForm && <Drawer open onClose={() => setEditForm(null)} title="Edit business profile" description={`Update registration and contact details for ${tenant.name}`}>
        <form className="space-y-5 p-5" onSubmit={e => {
          e.preventDefault();
          updateTenant.mutate({
            id,
            data: {
              name: editForm.name.trim(),
              slug: editForm.slug.trim(),
              phone: editForm.phone.trim() || null,
              address: editForm.address.trim() || null,
              city: editForm.city.trim() || null,
              country: editForm.country.trim() || null,
              website: editForm.website.trim() || null,
              business_type: editForm.business_type || null,
              industry: editForm.industry.trim() || null,
              business_category: editForm.business_category.trim() || null,
              employee_count: editForm.employee_count.trim() || null,
              business_location: editForm.business_location.trim() || null,
              heard_about: editForm.heard_about.trim() || null,
              preferred_contact: editForm.preferred_contact,
            },
          }, {
            onSuccess: () => setEditForm(null),
            onError: () => setNotice({ kind: "error", text: "Could not save business profile" }),
          });
        }}>
          <div className="space-y-3">
            <h2 className="pesaa-card-title">Business details</h2>
            {([
              ["name", "Business name", true],
              ["slug", "Business URL slug", true],
              ["phone", "Business phone", false],
              ["address", "Address", false],
              ["city", "City", false],
              ["website", "Website", false],
            ] as const).map(([key, label, required]) => (
              <Field key={key} label={label} required={required}>
                <Input required={required} value={editForm[key]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
              </Field>
            ))}
            <Field label="Country">
              <Select value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}>
                <option value="">Not specified</option>
                {COUNTRY_NAMES.map((country) => <option key={country} value={country}>{country}</option>)}
              </Select>
            </Field>
            <Field label="Preferred contact">
              <Select value={editForm.preferred_contact} onChange={(e) => {
                const value = e.target.value;
                if (value === "email" || value === "phone" || value === "whatsapp" || value === "all") {
                  setEditForm({ ...editForm, preferred_contact: value });
                }
              }}>
                <option value="email">Email</option><option value="phone">Phone call</option><option value="whatsapp">WhatsApp</option><option value="all">All</option>
              </Select>
            </Field>
          </div>
          <div className="space-y-3">
            <h2 className="pesaa-card-title">Registration details</h2>
            <Field label="Business type">
              <Select value={editForm.business_type} onChange={(e) => setEditForm({ ...editForm, business_type: e.target.value })}>
                <option value="">Not specified</option>
                <option value="sole">Sole proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="llc">Limited liability company</option>
                <option value="unregistered">Not registered</option>
              </Select>
            </Field>
            {([
              ["industry", "Industry"],
              ["business_category", "Business category"],
              ["employee_count", "Employee range"],
              ["business_location", "Business location"],
              ["heard_about", "How they heard about us"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input value={editForm[key]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
              </Field>
            ))}
          </div>
          <FormFooter submitLabel="Save profile" onCancel={() => setEditForm(null)} disabled={updateTenant.isPending} />
        </form>
      </Drawer>}
      {/* Change plan drawer */}
      {/* Invite drawer */}
      <Drawer open={!!permissionRole} onClose={() => setPermissionRole(null)} title="Role permissions" size="xl"><div className="p-4">{permissionRole && <RolePermissionManager tenantId={id} roleId={permissionRole}/>}</div></Drawer>
      <InviteBusinessUser tenantId={id} open={showInvite} onClose={() => setShowInvite(false)} />

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


    </div>
  );
}

export default function TenantDetailPage() {
  return <Suspense fallback={<PageLoader />}><TenantDetailPageInner /></Suspense>;
}
