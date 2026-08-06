"use client";
import { useState, useMemo } from "react";
import { Users, Loader2, CheckCircle, XCircle, Building2, Search, Filter, AlertTriangle, Shield } from "lucide-react";
import { useUsers } from "@/lib/api/hooks";
import Link from "next/link";

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-accent/10 text-accent border border-accent/20",
  admin:      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
  owner:      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  member:     "bg-surface text-muted border border-border",
  viewer:     "bg-surface text-muted border border-border",
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const { data, isLoading, isError } = useUsers(1, 500);
  const users = data?.items ?? [];

  const roles = [...new Set(users.map((u) => u.role))];

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = !search ||
        u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === "all" || u.role === filterRole;
      const matchStatus = filterStatus === "all" || (filterStatus === "active" ? u.is_active : !u.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, filterRole, filterStatus]);

  const activeCount = users.filter((u) => u.is_active).length;
  const superadminCount = users.filter((u) => u.is_superuser).length;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

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
            {data.total} users · {activeCount} active · {superadminCount} superadmin{superadminCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <Shield size={13} className="text-violet-600 dark:text-violet-400" />
            <span className="text-[12px] font-semibold text-violet-600 dark:text-violet-400">{superadminCount} Superadmin{superadminCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <Filter size={13} className="text-muted" />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer capitalize"
          >
            <option value="all">All Roles</option>
            {roles.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="text-sm bg-transparent text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider bg-surface/50">
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold hidden sm:table-cell">Tenant</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold hidden md:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-surface/40 transition-colors">
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
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Users size={32} className="text-muted/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">
              {search || filterRole !== "all" || filterStatus !== "all" ? "No users match your filters" : "No users yet"}
            </p>
            <p className="text-[12px] text-muted mt-1">
              {search || filterRole !== "all" || filterStatus !== "all" ? "Try adjusting your search or filters" : "Users will appear here once tenants are created"}
            </p>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-surface/30 text-[11px] text-muted">
            Showing {filtered.length} of {data.total} users
          </div>
        )}
      </div>
    </div>
  );
}
