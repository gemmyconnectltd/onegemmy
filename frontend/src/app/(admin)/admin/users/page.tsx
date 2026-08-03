"use client";
import { Users, Loader2, CheckCircle, XCircle, Building2 } from "lucide-react";
import { useUsers } from "@/lib/api/hooks";
import Link from "next/link";

export default function AdminUsersPage() {
  const { data, isLoading, isError } = useUsers(1, 200);
  const users = data?.items ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

  if (isError || !data) return (
    <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">Failed to load users</div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Users</h1>
        <p className="text-sm text-muted mt-0.5">{data.total} users across all tenants</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider">
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Tenant</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface/40 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-foreground">
                    {u.full_name}
                    {u.is_superuser && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent ml-2">SUPERADMIN</span>}
                  </p>
                  <p className="text-[11px] text-muted">{u.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  {u.tenant_id && u.tenant_name ? (
                    <Link
                      href={`/admin/tenants/${u.tenant_id}`}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline transition-colors w-fit"
                    >
                      <Building2 size={12} /> {u.tenant_name}
                    </Link>
                  ) : (
                    <span className="text-[12px] text-muted">—</span>
                  )}
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
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-16 text-center">
            <Users size={32} className="text-muted/30 mx-auto mb-3" />
            <p className="text-sm text-muted">No users yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
