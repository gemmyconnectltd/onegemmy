"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Form";
import { useAuth } from "@/lib/auth";
import { useMyEntitlements } from "@/lib/api/hooks";
import { MODULE_NAV, visibleModuleLinks, visiblePrimaryNavigation, type ModuleKey } from "@/lib/navigation";

export function NavigationSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { hasModuleAccess, hasPermission, isSuperAdmin } = useAuth();
  const { data } = useMyEntitlements();
  const primary = visiblePrimaryNavigation(data?.features, hasModuleAccess, hasPermission, isSuperAdmin()).flatMap((g) => g.items);
  const items = primary.flatMap((item) => [{ href: item.href, label: item.name }, ...(item.module && item.module in MODULE_NAV ? visibleModuleLinks(item.module as ModuleKey, hasPermission).map((child) => ({ href: child.href, label: `${item.name} · ${child.label || child.nameKey}` })) : [])]);
  const matches = [...new Map(items.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())).map((i) => [i.href, i])).values()];
  return <Drawer trackChanges={false} open={open} onClose={onClose} side="center" size="lg" title="Search pages"><div className="space-y-3 p-4"><div className="relative"><Search size={18} className="absolute left-3 top-3 text-muted" /><Input data-autofocus aria-label="Search pages" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sales, products, customers…" className="pl-10" /></div><nav aria-label="Search results" className="max-h-[55dvh] overflow-y-auto">{matches.map((item) => <Link key={item.href} href={item.href} onClick={onClose} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-surface">{item.label}</Link>)}{!matches.length && <p className="p-3 text-sm text-muted">No matching pages you can access.</p>}</nav></div></Drawer>;
}
