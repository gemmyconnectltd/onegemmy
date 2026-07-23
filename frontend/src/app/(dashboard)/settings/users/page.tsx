"use client";

import { useState } from "react";
import {
  Users, Plus, Search, MoreVertical, Shield, Mail, CheckCircle2,
  XCircle, Edit2, Trash2, UserPlus, Building2, Store
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { defaultRoles } from "@/lib/roles";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  platformRole: "super_admin" | "company_admin" | "user";
  status: "active" | "invited" | "inactive";
  shopId: string | null;
  lastActive: string;
}

const DEMO_MANAGED_USERS: ManagedUser[] = [
  { id: "2", name: "Company Admin", email: "admin@onegemmy.com", roleId: "owner", platformRole: "company_admin", status: "active", shopId: null, lastActive: "Just now" },
  { id: "3", name: "Shop Manager", email: "manager@onegemmy.com", roleId: "manager", platformRole: "user", status: "active", shopId: "s1", lastActive: "2 hours ago" },
  { id: "4", name: "Sales Rep", email: "sales@onegemmy.com", roleId: "sales_rep", platformRole: "user", status: "active", shopId: "s1", lastActive: "1 hour ago" },
  { id: "5", name: "Shop Staff", email: "staff@onegemmy.com", roleId: "employee", platformRole: "user", status: "active", shopId: "s1", lastActive: "30 min ago" },
  { id: "6", name: "New Hire", email: "newhire@onegemmy.com", roleId: "employee", platformRole: "user", status: "invited", shopId: null, lastActive: "Never" },
];

const statusColors = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  invited: "bg-amber-50 text-amber-700 border-amber-200",
  inactive: "bg-gray-50 text-gray-500 border-gray-200",
};

const statusIcons = {
  active: CheckCircle2,
  invited: Mail,
  inactive: XCircle,
};

export default function UsersPage() {
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>(DEMO_MANAGED_USERS);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", roleId: "employee", shopId: "" });
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const getRoleName = (roleId: string) => {
    if (roleId === "super_admin") return "Super Admin";
    return defaultRoles.find((r) => r.id === roleId)?.name ?? roleId;
  };

  const getRoleColor = (roleId: string) => {
    if (roleId === "super_admin") return "#dc2626";
    return defaultRoles.find((r) => r.id === roleId)?.color ?? "#64748B";
  };

  const handleInvite = () => {
    if (!inviteForm.name || !inviteForm.email) return;
    const newUser: ManagedUser = {
      id: String(users.length + 1),
      name: inviteForm.name,
      email: inviteForm.email,
      roleId: inviteForm.roleId,
      platformRole: "user",
      status: "invited",
      shopId: inviteForm.shopId || null,
      lastActive: "Never",
    };
    setUsers((prev) => [...prev, newUser]);
    setInviteForm({ name: "", email: "", roleId: "employee", shopId: "" });
    setShowInvite(false);
  };

  const handleStatusChange = (userId: string, newStatus: "active" | "inactive") => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)));
  };

  const handleRoleChange = (userId: string, newRoleId: string) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roleId: newRoleId } : u)));
    setEditingUser(null);
  };

  const handleDelete = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setOpenMenu(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted mt-1">Manage team members and their access</p>
        </div>
        <PermissionGuard permission="settings.users.manage">
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 bg-[#6f1a07] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-colors"
          >
            <UserPlus size={16} />
            Invite User
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: users.filter((u) => u.status === "active").length, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "Invited", value: users.filter((u) => u.status === "invited").length, icon: Mail, color: "text-amber-500" },
          { label: "Inactive", value: users.filter((u) => u.status === "inactive").length, icon: XCircle, color: "text-gray-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-surface flex items-center justify-center">
              <stat.icon size={18} className={stat.color} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/5"
        />
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white border-2 border-primary p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Invite New User</h3>
            <button onClick={() => setShowInvite(false)} className="text-muted hover:text-foreground text-sm">Cancel</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="user@company.com"
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Role</label>
              <select
                value={inviteForm.roleId}
                onChange={(e) => setInviteForm((p) => ({ ...p, roleId: e.target.value }))}
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none bg-white"
              >
                {defaultRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Assign to Shop (optional)</label>
              <select
                value={inviteForm.shopId}
                onChange={(e) => setInviteForm((p) => ({ ...p, shopId: e.target.value }))}
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none bg-white"
              >
                <option value="">No shop</option>
                <option value="s1">Kigali Main Store</option>
                <option value="s2">Nyamirambo Branch</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleInvite}
            className="bg-[#6f1a07] text-white px-4 py-2 text-sm font-medium hover:bg-[#5a1506] transition-colors"
          >
            Send Invitation
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold text-muted uppercase tracking-wider hidden sm:table-cell">Last Active</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((u) => {
              const StatusIcon = statusIcons[u.status];
              return (
                <tr key={u.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-foreground/10 flex items-center justify-center text-[11px] font-bold text-foreground/60 rounded-full">
                        {u.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{u.name}</p>
                        <p className="text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === u.id ? (
                      <select
                        autoFocus
                        defaultValue={u.roleId}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        onBlur={() => setEditingUser(null)}
                        className="px-2 py-1 border border-border text-xs focus:outline-none bg-white"
                      >
                        {defaultRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingUser(u.id)}
                        className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity"
                      >
                        <div className="w-2 h-2 rounded-full" style={{ background: getRoleColor(u.roleId) }} />
                        <span className="text-foreground">{getRoleName(u.roleId)}</span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 border ${statusColors[u.status]}`}>
                      <StatusIcon size={12} />
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted hidden sm:table-cell">{u.lastActive}</td>
                  <td className="px-2">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                        className="p-1.5 hover:bg-surface transition-colors"
                      >
                        <MoreVertical size={14} className="text-muted" />
                      </button>
                      {openMenu === u.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-border shadow-lg z-20 py-1">
                            <button
                              onClick={() => { setEditingUser(u.id); setOpenMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface"
                            >
                              <Edit2 size={14} />
                              Edit Role
                            </button>
                            {u.status === "active" ? (
                              <button
                                onClick={() => handleStatusChange(u.id, "inactive")}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface"
                              >
                                <XCircle size={14} />
                                Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStatusChange(u.id, "active")}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface"
                              >
                                <CheckCircle2 size={14} />
                                Activate
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <Users size={32} className="text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">No users found</p>
          </div>
        )}
      </div>
    </div>
  );
}
