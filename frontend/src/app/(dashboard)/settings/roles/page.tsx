"use client";

import { useState } from "react";
import { Shield, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { defaultRoles, permissions, modules, getPermissionsByModule, type Role } from "@/lib/roles";

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>(defaultRoles);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [expandedModules, setExpandedModules] = useState<string[]>(["Dashboard"]);
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", description: "", color: "#64748B", permissions: [] as string[] });

  const toggleModule = (mod: string) => {
    setExpandedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const togglePermission = (permId: string) => {
    if (!selectedRole || selectedRole.isSystem) return;
    setSelectedRole((prev) => {
      if (!prev) return prev;
      const has = prev.permissions.includes(permId);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== permId)
          : [...prev.permissions, permId],
      };
    });
  };

  const toggleModuleAll = (mod: string) => {
    if (!selectedRole || selectedRole.isSystem) return;
    const modPerms = getPermissionsByModule(mod).map((p) => p.id);
    const hasAll = modPerms.every((p) => selectedRole.permissions.includes(p));
    setSelectedRole((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        permissions: hasAll
          ? prev.permissions.filter((p) => !modPerms.includes(p))
          : [...new Set([...prev.permissions, ...modPerms])],
      };
    });
  };

  const saveRole = () => {
    if (!selectedRole) return;
    setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? selectedRole : r)));
  };

  const deleteRole = (id: string) => {
    if (defaultRoles.find((r) => r.id === id)?.isSystem) return;
    setRoles((prev) => prev.filter((r) => r.id !== id));
    if (selectedRole?.id === id) setSelectedRole(null);
  };

  const createRole = () => {
    if (!newRole.name) return;
    const role: Role = {
      id: newRole.name.toLowerCase().replace(/\s+/g, "_"),
      name: newRole.name,
      description: newRole.description,
      color: newRole.color,
      permissions: newRole.permissions,
    };
    setRoles((prev) => [...prev, role]);
    setNewRole({ name: "", description: "", color: "#64748B", permissions: [] });
    setShowNewRole(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles & Permissions</h1>
          <p className="text-sm text-muted mt-1">Manage what each role can access</p>
        </div>
        <button
          onClick={() => setShowNewRole(true)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          New Role
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Roles list */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-foreground mb-3">Roles ({roles.length})</h2>

          {showNewRole && (
            <div className="bg-white border-2 border-primary p-4 space-y-3">
              <input
                type="text"
                placeholder="Role name"
                value={newRole.name}
                onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="text"
                placeholder="Description"
                value={newRole.description}
                onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="color"
                value={newRole.color}
                onChange={(e) => setNewRole((p) => ({ ...p, color: e.target.value }))}
                className="w-full h-8 border border-border cursor-pointer"
              />
              <div className="flex gap-2">
                <button onClick={createRole} className="flex-1 bg-accent text-white py-2 text-sm font-medium hover:bg-accent/90">
                  Create
                </button>
                <button onClick={() => setShowNewRole(false)} className="flex-1 border border-border py-2 text-sm text-foreground hover:bg-surface">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role)}
              className={`w-full text-left p-4 border transition-colors ${
                selectedRole?.id === role.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white hover:bg-surface"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: role.color }}
                  />
                  <div>
                    <p className="text-sm font-bold text-foreground">{role.name}</p>
                    <p className="text-xs text-muted mt-0.5">{role.permissions.length} permissions</p>
                  </div>
                </div>
                {role.isSystem && (
                  <span className="text-[10px] bg-foreground/5 text-foreground/50 px-2 py-0.5">System</span>
                )}
              </div>
              <p className="text-xs text-muted mt-2">{role.description}</p>
            </button>
          ))}
        </div>

        {/* Permissions editor */}
        <div className="lg:col-span-2">
          {selectedRole ? (
            <div className="bg-white border border-border">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ background: selectedRole.color }}
                  />
                  <div>
                    <h3 className="font-bold text-foreground">{selectedRole.name}</h3>
                    <p className="text-xs text-muted">{selectedRole.permissions.length} permissions assigned</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedRole.isSystem && (
                    <>
                      <button
                        onClick={saveRole}
                        className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 text-xs font-medium hover:bg-accent/90"
                      >
                        <Check size={14} />
                        Save
                      </button>
                      <button
                        onClick={() => deleteRole(selectedRole.id)}
                        className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {modules.map((mod) => {
                  const modPerms = getPermissionsByModule(mod);
                  const allChecked = modPerms.every((p) => selectedRole.permissions.includes(p.id));
                  const someChecked = modPerms.some((p) => selectedRole.permissions.includes(p.id));
                  const expanded = expandedModules.includes(mod);

                  return (
                    <div key={mod} className="border border-border rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between p-3 bg-surface cursor-pointer hover:bg-foreground/5 transition-colors"
                        onClick={() => toggleModule(mod)}
                      >
                        <div className="flex items-center gap-3">
                          {expanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                          <span className="text-sm font-bold text-foreground">{mod}</span>
                          <span className="text-xs text-muted">{modPerms.length} permissions</span>
                        </div>
                        {!selectedRole.isSystem && (
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModuleAll(mod);
                            }}
                          >
                            <div
                              className={`w-5 h-5 border-2 flex items-center justify-center cursor-pointer transition-colors ${
                                allChecked
                                  ? "bg-accent border-accent"
                                  : someChecked
                                  ? "bg-accent/20 border-accent"
                                  : "border-border"
                              }`}
                            >
                              {allChecked && <Check size={12} className="text-white" />}
                              {someChecked && !allChecked && <div className="w-2 h-0.5 bg-accent" />}
                            </div>
                          </div>
                        )}
                      </div>

                      {expanded && (
                        <div className="p-3 space-y-2 border-t border-border">
                          {modPerms.map((perm) => {
                            const checked = selectedRole.permissions.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                className="flex items-center justify-between p-2 hover:bg-surface/50 cursor-pointer"
                              >
                                <div>
                                  <p className="text-sm text-foreground">{perm.name}</p>
                                  <p className="text-xs text-muted">{perm.description}</p>
                                </div>
                                <div
                                  className={`w-5 h-5 border-2 flex items-center justify-center cursor-pointer transition-colors ${
                                    checked
                                      ? "bg-accent border-accent"
                                      : "border-border"
                                  }`}
                                  onClick={() => togglePermission(perm.id)}
                                >
                                  {checked && <Check size={12} className="text-white" />}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-border p-12 flex flex-col items-center justify-center text-center">
              <Shield size={48} className="text-muted mb-4" />
              <h3 className="text-lg font-bold text-foreground mb-1">Select a role</h3>
              <p className="text-sm text-muted">Click a role from the left to view and edit its permissions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
