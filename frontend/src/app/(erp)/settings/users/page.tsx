"use client";

import { useState } from "react";
import { Users, Plus, Edit2, Trash2, Shield, UserCheck } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";

const C = "#4f46e5";

type User = { id: number; name: string; email: string; role: string; status: string };

const INITIAL_USERS: User[] = [
  { id: 1, name: "Admin User",       email: "admin@onegemmy.com",      role: "Admin",               status: "Active" },
  { id: 2, name: "Inventory Manager",email: "inventory@onegemmy.com",  role: "Inventory Manager",   status: "Active" },
  { id: 3, name: "Finance Manager",  email: "finance@onegemmy.com",    role: "Finance Manager",     status: "Active" },
  { id: 4, name: "HR Manager",       email: "hr@onegemmy.com",         role: "HR Manager",          status: "Active" },
  { id: 5, name: "Sales Manager",    email: "sales@onegemmy.com",      role: "Sales Manager",       status: "Active" },
  { id: 6, name: "Sales Staff",      email: "salesstaff@onegemmy.com", role: "Sales Manager",       status: "Inactive" },
];

const ROLES = ["Admin", "Inventory Manager", "Finance Manager", "HR Manager", "Sales Manager", "Procurement Manager"];

const STATUS_STYLE: Record<string, string> = {
  Active:   "bg-emerald-100 text-emerald-700",
  Inactive: "bg-surface text-muted",
};

const EMPTY_FORM = { name: "", email: "", role: "Admin", status: "Active" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const active = users.filter((u) => u.status === "Active").length;

  const openAdd = () => { setForm(EMPTY_FORM); setShowAdd(true); };
  const openEdit = (u: User) => { setEditing(u); setForm({ name: u.name, email: u.email, role: u.role, status: u.status }); };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setUsers((prev) => [...prev, { id: Date.now(), ...form }]);
    setShowAdd(false);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setUsers((prev) => prev.map((u) => u.id === editing.id ? { ...u, ...form } : u));
    setEditing(null);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this user?")) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const UserForm = ({ onSubmit, label }: { onSubmit: (e: React.FormEvent) => void; label: string }) => (
    <form onSubmit={onSubmit} className="p-5 space-y-4">
      <Field label="Full Name" required>
        <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Doe" />
      </Field>
      <Field label="Email" required>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
      </Field>
      <Field label="Role">
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option>Active</option>
          <option>Inactive</option>
        </Select>
      </Field>
      <FormFooter submitLabel={label} onCancel={() => { setShowAdd(false); setEditing(null); }} disabled={!form.name || !form.email} />
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Users & Roles</h1>
          <p className="text-sm text-muted mt-0.5">{users.length} users · {active} active</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg" style={{ backgroundColor: C }}>
          <Plus size={15} /> Add User
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Users",  value: String(users.length), icon: Users,     color: C },
          { label: "Active",       value: String(active),       icon: UserCheck, color: "#10b981" },
          { label: "Inactive",     value: String(users.length - active), icon: Users, color: "#94a3b8" },
          { label: "Roles",        value: String(ROLES.length), icon: Shield,    color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-foreground/15 transition-all">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">All Users</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-semibold">Name</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold">Role</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface/50 transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0" style={{ backgroundColor: C }}>
                      {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground">{u.name}</span>
                  </div>
                </td>
                <td className="p-4 text-sm text-muted">{u.email}</td>
                <td className="p-4">
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface text-foreground/70">{u.role}</span>
                </td>
                <td className="p-4">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[u.status]}`}>{u.status}</span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(u)} className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(u.id)} className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={showAdd} onClose={() => setShowAdd(false)} title="Add User" description="Create a new user account" size="md">
        <UserForm onSubmit={handleAdd} label="Add User" />
      </Drawer>
      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit User" description={editing?.name} size="md">
        <UserForm onSubmit={handleEdit} label="Save Changes" />
      </Drawer>
    </div>
  );
}
