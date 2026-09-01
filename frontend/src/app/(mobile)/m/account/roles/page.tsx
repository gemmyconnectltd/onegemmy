"use client";

import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { useAuth } from "@/lib/auth";

function moduleLabel(prefix: string) {
  const map: Record<string, string> = {
    sales: "Sales",
    purchase: "Purchases",
    procurement: "Procurement",
    inventory: "Inventory",
    accounting: "Accounting",
    hr: "HR",
    admin: "Admin",
    settings: "Settings",
    tenants: "Tenant",
  };
  return map[prefix.toLowerCase()] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export default function MobileRolesPage() {
  const { user } = useAuth();

  const permissions = user?.permissions ?? [];
  const groups: { module: string; perms: string[] }[] = [];
  for (const p of permissions) {
    const [prefix, ...rest] = p.split(":");
    const name = rest.length ? rest.join(":") : p;
    let group = groups.find((g) => g.module === prefix);
    if (!group) {
      group = { module: prefix, perms: [] };
      groups.push(group);
    }
    group.perms.push(name);
  }

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader title="Roles & permissions" subtitle="Access for this account" />
      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Current role */}
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-foreground capitalize">{user?.role ?? "Member"}</p>
            <p className="text-[10px] text-muted mt-0.5">Your current role in {user?.tenantName ?? "this business"}</p>
          </div>
        </div>

        {/* Permission groups */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No permissions loaded for this account.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.module}>
              <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">
                {moduleLabel(g.module)}
              </p>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex flex-wrap gap-1.5">
                  {g.perms.map((name) => (
                    <span key={name} className="px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-semibold">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
