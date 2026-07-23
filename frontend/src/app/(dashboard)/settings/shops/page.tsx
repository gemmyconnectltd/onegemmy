"use client";

import { useState } from "react";
import { Store, Plus, Search, MapPin, Building2, CheckCircle2, XCircle, Edit2, Trash2, MoreVertical } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function ShopsPage() {
  const { user, companies, shops, isSuperAdmin, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newShop, setNewShop] = useState({ name: "", location: "", companyId: "" });
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const myCompanyShops = isSuperAdmin()
    ? shops
    : shops.filter((s) => s.companyId === user?.companyId);

  const filtered = myCompanyShops.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
  );

  const getCompanyName = (companyId: string) => companies.find((c) => c.id === companyId)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shops</h1>
          <p className="text-sm text-muted mt-1">{isSuperAdmin() ? "Manage all shops across companies" : "Manage your shop locations"}</p>
        </div>
        {isAdmin() && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-[#6f1a07] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#5a1506] transition-colors"
          >
            <Plus size={16} />
            New Shop
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Shops", value: myCompanyShops.length },
          { label: "Active", value: myCompanyShops.filter((s) => s.status === "active").length },
          { label: "Inactive", value: myCompanyShops.filter((s) => s.status === "inactive").length },
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
          placeholder="Search shops..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted/60 focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/5"
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border-2 border-primary p-5 space-y-4">
          <h3 className="text-sm font-bold text-foreground">Create New Shop</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Shop Name</label>
              <input
                type="text"
                value={newShop.name}
                onChange={(e) => setNewShop((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Kigali Branch"
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Location</label>
              <input
                type="text"
                value={newShop.location}
                onChange={(e) => setNewShop((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Kigali, Rwanda"
                className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none"
              />
            </div>
            {isSuperAdmin() && (
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1">Company</label>
                <select
                  value={newShop.companyId}
                  onChange={(e) => setNewShop((p) => ({ ...p, companyId: e.target.value }))}
                  className="w-full px-3 py-2 border border-border text-sm focus:border-primary focus:outline-none bg-white"
                >
                  <option value="">Select company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="bg-[#6f1a07] text-white px-4 py-2 text-sm font-medium hover:bg-[#5a1506]"
            >
              Create Shop
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

      {/* Shop cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((shop) => (
          <div key={shop.id} className="bg-white border border-border p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-surface flex items-center justify-center">
                  <Store size={18} className="text-foreground/60" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{shop.name}</h3>
                  {isSuperAdmin() && (
                    <p className="text-[11px] text-muted">{getCompanyName(shop.companyId)}</p>
                  )}
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === shop.id ? null : shop.id)}
                  className="p-1 hover:bg-surface transition-colors"
                >
                  <MoreVertical size={14} className="text-muted" />
                </button>
                {openMenu === shop.id && (
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

            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <MapPin size={12} />
              {shop.location || "No location set"}
            </div>

            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 border ${
                shop.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}>
                {shop.status === "active" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {shop.status}
              </span>
              {user?.shopId === shop.id && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 font-medium">Current</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white border border-border py-12 text-center">
          <Store size={32} className="text-muted mx-auto mb-3" />
          <p className="text-sm text-muted">No shops found</p>
        </div>
      )}
    </div>
  );
}
