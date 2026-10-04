"use client";
import { useState } from "react";
import { Users, CheckCircle, XCircle, Building2, Search, Filter, AlertTriangle, Shield, Download, CheckCircle2 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useUsers, useTenants } from "@/lib/api/hooks";
import type { AdminUserFilters } from "@/lib/api/admin";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { ExportUsersModal } from "./ExportUsersModal";
import Link from "next/link";

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-accent/10 text-accent border border-accent/20",
  admin:      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
  owner:      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  member:     "bg-surface text-muted border border-border",
  viewer:     "bg-surface text-muted border border-border",
};

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterTenantId, setFilterTenantId] = useState("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);
  const [showExport, setShowExport] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Server-side filters — the same ones the export endpoint accepts, so
  // "Filtered Results" in the export modal always matches what's on screen.
  const filters: AdminUserFilters = {
    search: search.trim() || undefined,
    tenant_id: filterTenantId !== "all" ? filterTenantId : undefined,
    role: filterRole !== "all" ? filterRole : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
  };
  const hasFilters = Object.values(filters).some((v) => v !== undefined);

  const { data, isLoading, isError } = useUsers(page, PAGE_SIZE, filters);
  const { data: allUsersData } = useUsers(1, 1); // just needs .total, for "All Users" scope
  const { data: tenantsData } = useTenants(1, 200);

  const users = data?.items ?? [];
  const tenants = tenantsData?.items ?? [];
  const bulk = useBulkSelection(users.map((u) => u.id));

  const activeCount = users.filter((u) => u.is_active).length;
  const superadminCount = users.filter((u) => u.is_superuser).length;

  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onRoleChange = (v: string) => { setFilterRole(v); setPage(1); };
  const onStatusChange = (v: "all" | "active" | "inactive") => { setFilterStatus(v); setPage(1); };
  const onTenantChange = (v: string) => { setFilterTenantId(v); setPage(1); };
  const onDateChange = (which: "from" | "to", v: string) => {
    if (which === "from") setCreatedFrom(v); else setCreatedTo(v);
    setPage(1);
  };

  const filtersLabel = [
    search.trim() ? { label: "Search", value: search.trim() } : null,
    filterTenantId !== "all" ? { label: "Business", value: tenants.find((t) => t.id === filterTenantId)?.name ?? filterTenantId } : null,
    filterRole !== "all" ? { label: "Role", value: filterRole } : null,
    filterStatus !== "all" ? { label: "Status", value: filterStatus } : null,
    createdFrom ? { label: "Created From", value: createdFrom } : null,
    createdTo ? { label: "Created To", value: createdTo } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  if (isLoading) return <PageLoader />;

  if (isError || !data) return (
    <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertTriangle size={15} /> Failed to load users
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Users</h1>
          <p className="text-sm text-muted mt-0.5">
            {data.total} users · {activeCount} active (this page) · {superadminCount} superadmin{superadminCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <Shield size={13} className="text-violet-600 dark:text-violet-400" />
            <span className="text-[12px] font-semibold text-violet-600 dark:text-violet-400">{superadminCount} Superadmin{superadminCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${notice.type === "success" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20"}`}>
          {notice.type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {notice.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <Building2 size={13} className="text-muted" />
          <select
            value={filterTenantId}
            onChange={(e) => onTenantChange(e.target.value)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer max-w-[160px]"
          >
            <option value="all">All Businesses</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <Filter size={13} className="text-muted" />
          <select
            value={filterRole}
            onChange={(e) => onRoleChange(e.target.value)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer capitalize"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <select
            value={filterStatus}
            onChange={(e) => onStatusChange(e.target.value as typeof filterStatus)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-card border border-border rounded-xl">
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => onDateChange("from", e.target.value)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer w-[130px]"
            title="Created from"
          />
          <span className="text-muted text-sm">–</span>
          <input
            type="date"
            value={createdTo}
            onChange={(e) => onDateChange("to", e.target.value)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer w-[130px]"
            title="Created to"
          />
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent/90 rounded-xl transition-colors"
        >
          <Download size={14} /> Export
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider bg-surface/50">
              <th className="px-5 py-3 font-semibold w-10">
                <input
                  type="checkbox"
                  checked={bulk.allSelected}
                  ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }}
                  onChange={bulk.toggleAll}
                  className="w-4 h-4 rounded"
                  disabled={users.length === 0}
                />
              </th>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold hidden sm:table-cell">Tenant</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold hidden md:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface/40 transition-colors">
                <td className="px-5 py-3.5">
                  <input type="checkbox" checked={bulk.selected.has(u.id)} onChange={() => bulk.toggle(u.id)} className="w-4 h-4 rounded" />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">
                      {u.full_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                      <p className="text-[11px] text-muted">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 hidden sm:table-cell">
                  {u.tenant_id && u.tenant_name ? (
                    <Link href={`/admin/tenants/${u.tenant_id}`}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline transition-colors w-fit"
                    >
                      <Building2 size={12} /> {u.tenant_name}
                    </Link>
                  ) : (
                    <span className="text-[12px] text-muted">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg capitalize ${ROLE_COLORS[u.role] ?? "bg-surface text-muted border border-border"}`}>
                    {u.is_superuser ? "superadmin" : u.role}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`flex items-center gap-1 text-[11px] font-semibold w-fit px-2 py-0.5 rounded-lg ${u.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                    {u.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell text-[12px] text-muted">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {users.length === 0 && (
          <div className="py-16 text-center">
            <Users size={32} className="text-muted/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">
              {hasFilters ? "No users match your filters" : "No users yet"}
            </p>
            <p className="text-[12px] text-muted mt-1">
              {hasFilters ? "Try adjusting your search or filters" : "Users will appear here once tenants are created"}
            </p>
          </div>
        )}
        {users.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-surface/30 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">
              Showing {users.length} of {data.total} users{bulk.count > 0 ? ` · ${bulk.count} selected` : ""}
            </p>
            {data.total > PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-[11px] font-semibold border border-border rounded-lg text-foreground/70 hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  Prev
                </button>
                <span className="text-[11px] text-muted">Page {page} of {Math.ceil(data.total / PAGE_SIZE)}</span>
                <button
                  onClick={() => setPage((p) => (p * PAGE_SIZE < data.total ? p + 1 : p))}
                  disabled={page * PAGE_SIZE >= data.total}
                  className="px-2.5 py-1 text-[11px] font-semibold border border-border rounded-lg text-foreground/70 hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ExportUsersModal
        open={showExport}
        onClose={() => setShowExport(false)}
        filters={filters}
        filtersLabel={filtersLabel}
        filteredTotal={data.total}
        allTotal={allUsersData?.total ?? data.total}
        currentPageCount={users.length}
        page={page}
        pageSize={PAGE_SIZE}
        selectedIds={Array.from(bulk.selected)}
        onExported={(count) => {
          setNotice({ type: "success", text: `${count} user${count === 1 ? "" : "s"} exported successfully.` });
          setTimeout(() => setNotice(null), 4000);
        }}
        onError={(message) => {
          setNotice({ type: "error", text: message });
          setTimeout(() => setNotice(null), 5000);
        }}
      />
    </div>
  );
}
