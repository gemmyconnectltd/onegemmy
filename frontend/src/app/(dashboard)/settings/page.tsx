"use client";

import { useState } from "react";
import { User, Bell, Shield, Palette, Building2, Users, Store, Key } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ModuleGuard } from "@/components/auth/PermissionGuard";

const tabs = [
  { id: "profile", label: "Profile", icon: User },
  { id: "company", label: "Company", icon: Building2, adminOnly: true },
  { id: "shops", label: "Shops", icon: Store, adminOnly: true },
  { id: "users", label: "Users", icon: Users, permission: "settings.users.manage" },
  { id: "roles", label: "Roles", icon: Shield, permission: "settings.roles.manage" },
  { id: "security", label: "Security", icon: Key },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export default function SettingsPage() {
  const { user, isSuperAdmin, isAdmin, getRole } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const role = getRole();

  const visibleTabs = tabs.filter((tab) => {
    if (isSuperAdmin()) return true;
    if (tab.adminOnly) return isAdmin();
    if (tab.permission) return user?.platformRole === "super_admin" || user?.platformRole === "company_admin";
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account and application preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-56 flex-shrink-0 hidden lg:block">
          <nav className="space-y-0.5">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/60 hover:bg-surface hover:text-foreground"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 lg:hidden -mx-1 px-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors rounded-lg ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/60 hover:bg-surface"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "company" && <ModuleGuard module="Settings"><CompanyTab /></ModuleGuard>}
          {activeTab === "shops" && <ModuleGuard module="Settings"><ShopsTab /></ModuleGuard>}
          {activeTab === "users" && <ModuleGuard module="Settings"><UsersTab /></ModuleGuard>}
          {activeTab === "roles" && <ModuleGuard module="Settings"><RolesTab /></ModuleGuard>}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "notifications" && <NotificationsTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, getRole } = useAuth();
  const role = getRole();

  return (
    <div className="bg-white border border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-6">Profile Settings</h2>
      <div className="space-y-5 max-w-xl">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-primary/10 flex items-center justify-center text-xl font-bold text-primary rounded-full">
            {user?.name?.split(" ").map((n) => n[0]).join("") ?? "U"}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted">{user?.email}</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
          <input
            type="text"
            defaultValue={user?.name ?? ""}
            className="w-full px-3 py-2.5 border border-border text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
          <input
            type="email"
            defaultValue={user?.email ?? ""}
            disabled
            className="w-full px-3 py-2.5 border border-border text-sm text-muted bg-surface"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: role?.color }} />
            <span className="text-sm text-foreground">{role?.name ?? user?.roleId}</span>
          </div>
        </div>
        {user?.platformRole && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Platform Role</label>
            <span className="inline-flex text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
              {user.platformRole === "super_admin" ? "Super Admin" : user.platformRole === "company_admin" ? "Company Admin" : "User"}
            </span>
          </div>
        )}
        <button className="bg-[#6f1a07] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}

function CompanyTab() {
  return (
    <div className="bg-white border border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-6">Company Settings</h2>
      <div className="space-y-5 max-w-xl">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Company Name</label>
          <input type="text" defaultValue="Gemmy Connect Ltd" className="w-full px-3 py-2.5 border border-border text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Industry</label>
          <input type="text" defaultValue="Technology" className="w-full px-3 py-2.5 border border-border text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Website</label>
          <input type="url" defaultValue="https://gemmyconnect.com" className="w-full px-3 py-2.5 border border-border text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
        <button className="bg-[#6f1a07] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}

function ShopsTab() {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted">Navigate to <a href="/settings/shops" className="text-primary hover:underline font-medium">Shops</a> to manage shop locations.</p>
    </div>
  );
}

function UsersTab() {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted">Navigate to <a href="/settings/users" className="text-primary hover:underline font-medium">Users</a> to manage team members.</p>
    </div>
  );
}

function RolesTab() {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted">Navigate to <a href="/settings/roles" className="text-primary hover:underline font-medium">Roles & Permissions</a> to manage access control.</p>
    </div>
  );
}

function SecurityTab() {
  return (
    <div className="bg-white border border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-6">Security</h2>
      <div className="space-y-5 max-w-xl">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Current Password</label>
          <input type="password" placeholder="Enter current password" className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">New Password</label>
          <input type="password" placeholder="Enter new password" className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Confirm Password</label>
          <input type="password" placeholder="Confirm new password" className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
        <button className="bg-[#6f1a07] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-colors">
          Update Password
        </button>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    emailSales: true,
    emailStock: true,
    emailFinance: false,
    pushEnabled: true,
  });

  return (
    <div className="bg-white border border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-6">Notifications</h2>
      <div className="space-y-4 max-w-xl">
        {[
          { key: "emailSales", label: "Sales alerts", desc: "New deals, closed sales, targets" },
          { key: "emailStock", label: "Inventory alerts", desc: "Low stock, stock adjustments" },
          { key: "emailFinance", label: "Finance alerts", desc: "Invoices, payments, expenses" },
          { key: "pushEnabled", label: "Push notifications", desc: "Browser push notifications" },
        ].map((item) => (
          <label key={item.key} className="flex items-center justify-between p-3 hover:bg-surface/50 transition-colors">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted">{item.desc}</p>
            </div>
            <button
              onClick={() => setPrefs((p) => ({ ...p, [item.key]: !p[item.key as keyof typeof p] }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                prefs[item.key as keyof typeof p] ? "bg-[#6f1a07]" : "bg-gray-200"
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                prefs[item.key as keyof typeof p] ? "left-5.5 translate-x-0" : "left-0.5"
              }`} />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
