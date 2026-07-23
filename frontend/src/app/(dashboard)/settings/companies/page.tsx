"use client";

import { useState } from "react";
import { Building2, Plus, Search, Users, Store, Calendar, Edit2, Trash2, MoreVertical, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

const planColors: Record<string, string> = {
  free: "bg-gray-50 text-gray-600 border-gray-200",
  starter: "bg-blue-50 text-blue-600 border-blue-200",
  professional: "bg-purple-50 text-purple-600 border-purple-200",
  enterprise: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function CompaniesPage() {
  const { companies, shops, isSuperAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", plan: "free" });
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const getShopCount = (companyId: string) => shops.filter((s) => s.companyId === companyId).length;

  if (!isSuperAdmin()) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company</h1>
          <p className="text-sm text-muted mt-1">Your company information</p>
        </div>
        <div className="bg-white border border-border p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-primary/10 flex items-center justify-center">
              <Building2 size={24} className="text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground">{companies[0]?.name ?? "No Company"}</h3>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted">
                <span className="flex items-center gap-1"><Store size={14} /> {getShopCount(companies[0]?.id)} shops</span>
                <span className="flex items-center gap-1"><Calendar size={14} /> Since {companies[0]?.createdAt}</span>
              </div>
              <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 mt-3 border ${planColors[companies[0]?.plan] ?? planColors.free}`}>
                {companies[0]?.plan?.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Companies</h1>
          <p className="text-sm text-muted mt-1">Manage all companies on the platform</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#6f1a07] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-colors"
        >
          <Plus size={16} />
          New Company
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Companies", value: companies.length },
          { label: "Total Shops", value: shops.length },
          { label: "Active Shops", value: shops.filter((s) => s.status === "active").length },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-border p-4">
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/5"
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border-2 border-primary p-5 space-y-4">
          <h3 className="text-sm font-bold text-foreground">Create New Company</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Company Name</label>
              <input
                type="text"
                value={newCompany.name}
                onChange={(e) => setNewCompany((p) => ({ ...p, name: e.target.value }))}
                placeholder="Company name"
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Plan</label>
              <select
                value={newCompany.plan}
                onChange={(e) => setNewCompany((p) => ({ ...p, plan: e.target.value }))}
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none bg-white"
              >
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="bg-[#6f1a07] text-white px-4 py-2 text-sm font-medium hover:bg-[#5a1506]"
            >
              Create Company
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="border border-border px-4 py-2 text-sm text-foreground hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Company cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((company) => {
          const shopCount = getShopCount(company.id);
          const companyShops = shops.filter((s) => s.companyId === company.id);

          return (
            <div key={company.id} className="bg-white border border-border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 flex items-center justify-center">
                    <Building2 size={18} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{company.name}</h3>
                    <p className="text-[11px] text-muted">{company.slug}</p>
                  </div>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === company.id ? null : company.id)}
                    className="p-1 hover:bg-surface transition-colors"
                  >
                    <MoreVertical size={14} className="text-muted" />
                  </button>
                  {openMenu === company.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-border shadow-lg z-20 py-1">
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <span className={`inline-flex text-[10px] font-medium px-2 py-0.5 border ${planColors[company.plan] ?? planColors.free}`}>
                {company.plan.toUpperCase()}
              </span>

              <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                <span className="flex items-center gap-1"><Store size={12} /> {shopCount} shops</span>
                <span className="flex items-center gap-1"><Calendar size={12} /> {company.createdAt}</span>
              </div>

              {companyShops.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {companyShops.slice(0, 3).map((shop) => (
                    <div key={shop.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{shop.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${shop.status === "active" ? "bg-emerald-500" : "bg-gray-300"}`} />
                    </div>
                  ))}
                  {companyShops.length > 3 && (
                    <p className="text-[11px] text-muted">+{companyShops.length - 3} more</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
