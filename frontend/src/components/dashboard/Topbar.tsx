"use client";

import { Bell, Menu, ChevronDown, Search, Loader2, Globe, Store, Moon, Sun, LogOut, Building2, UserCircle } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppConfig } from "@/lib/appConfig";
import { BranchSwitcher } from "./BranchSwitcher";
import { Drawer } from "@/components/ui/Drawer";
import { LogoMark } from "@/components/ui/LogoMark";
import { NavigationSearch } from "./NavigationSearch";
import { AskPesaaAI } from "@/components/ai/AskPesaaAI";

interface TopbarProps {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  variant?: "app" | "admin";
}

// Overrides for URL segments where naively capitalizing the slug doesn't
// match the actual display name — either an acronym (HR, CRM) or a segment
// whose route name differs from what it's now called in the product
// (procurement → Purchases).
const SEGMENT_LABELS: Record<string, string> = {
  hr: "HR",
  crm: "CRM",
  pos: "POS",
  procurement: "Purchases",
};

const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getBreadcrumb(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((p, index) => {
    if (ID_SEGMENT.test(p)) return "Details"; // a record's id is not a name; showing it also overflowed the bar
    if (p === "orders" && index === 1 && parts[0] === "sales") return "Sales History";
    if (p === "orders" && index === 1 && parts[0] === "procurement") return "Purchase History";
    return SEGMENT_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
  });
}

export function Topbar({ onToggleSidebar, sidebarExpanded, variant = "app" }: TopbarProps) {
  const { user } = useAuth();
  const { translating, locale, setLocale, locales, theme, setTheme } = useAppConfig();
  const pathname = usePathname();
  const admin = variant === "admin";
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const [showUser, setShowUser] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); } if (e.key === "Escape") { setShowLang(false); setShowUser(false); } };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, []);
  const router = useRouter();
  const { logout, hasPermission } = useAuth();
  const breadcrumb = getBreadcrumb(pathname);

  const handleLogout = () => {
    setShowUser(false);
    logout();
    router.push("/login");
  };

  // A signed-in user can work across several businesses, so the company name
  // is pinned into the top bar on every screen — it's the only reliable way
  // to tell at a glance that you're in the right portal. Comes from the JWT
  // via the auth provider (restored in an effect), so it's null on the first
  // paint and never read from storage during render.
  const businessName = user?.tenantName;

  return (
    <>
    <header className="pesaa-topbar h-14 min-w-0 bg-card/95 backdrop-blur-sm border-b border-border flex items-center px-3 sm:px-4 gap-1 sm:gap-3 sticky top-0 z-30">
      {/* Mobile menu toggle */}
      <button
        onClick={onToggleSidebar}
        aria-label="Open navigation"
        aria-expanded={sidebarExpanded}
        aria-controls="mobile-sidebar-nav"
        className="w-11 h-11 shrink-0 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors lg:hidden"
      >
        <Menu size={18} />
      </button>

      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white min-[390px]:flex lg:hidden" aria-label="Pesaa"><LogoMark size={18} /></span>
      {!admin && <BranchSwitcher />}
      {!admin && <div className="hidden xl:block"><AskPesaaAI /></div>}

      {/* Breadcrumb */}
      <div className="hidden 2xl:flex items-center gap-1.5 pl-1 text-[14px] min-w-0">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-border">/</span>}
            <span className={i === breadcrumb.length - 1 ? "font-semibold text-foreground truncate" : "text-muted"}>
              {crumb}
            </span>
          </span>
        ))}
      </div>

      {/* Translating indicator */}
      {translating && (
        <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-muted">
          <Loader2 size={13} className="animate-spin" />
          <span>Translating...</span>
        </div>
      )}

      <div className="hidden flex-1 lg:block" />

      {/* POS */}
      {!admin && (
        <Link
          href="/pos"
          aria-label="Open point of sale"
          className={`hidden lg:flex items-center gap-2 px-2 sm:px-3.5 h-11 text-[13px] font-bold rounded-lg transition-colors flex-shrink-0 ${
            pathname === "/pos"
              ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/30"
              : "bg-accent text-white hover:bg-accent/90"
          }`}
        >
          <Store size={15} />
          <span className="hidden sm:inline">POS</span>
        </Link>
      )}

      {/* Search */}
      {!admin && (
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search pages" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface xl:w-44 xl:justify-start xl:gap-2 xl:border xl:border-border xl:px-3"><Search size={18} /><span className="hidden xl:inline">Search pages</span><kbd className="ml-auto hidden text-xs xl:inline">⌘K</kbd></button>
      )}

      {/* Notifications */}
      {!admin && (
        <button type="button" onClick={() => setNotificationsOpen(true)} aria-label="Notifications" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface"><Bell size={18} /></button>
      )}

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="hidden lg:flex w-11 h-11 shrink-0 items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Language switcher */}
      <div className="relative hidden lg:block">
        <button
          onClick={() => { setShowLang((v) => !v); setShowUser(false); }}
          className="w-11 h-11 shrink-0 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
          title="Change language"
        >
          <Globe size={16} />
        </button>
        {showLang && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowLang(false)} />
            <div className="absolute right-0 top-full mt-1 bg-card border border-border shadow-lg z-50 min-w-[150px]">
              {locales.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLocale(l.code); setShowLang(false); }}
                  className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    locale === l.code ? "bg-accent/10 text-accent" : "hover:bg-surface text-foreground"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* User */}
      <div className="relative">
        <button
          onClick={() => { setShowUser((v) => !v); setShowLang(false); }}
          aria-label="Open account menu" aria-expanded={showUser}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 lg:pl-2 lg:border-l border-border hover:opacity-80 transition-opacity"
        >
          <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
          </div>
          <div className="hidden xl:block text-left">
            <p className="text-[13px] font-semibold text-foreground leading-tight max-w-[100px] truncate">{user?.name}</p>
            <p className="text-[11px] text-muted leading-tight capitalize">{user?.role}</p>
          </div>
          <ChevronDown size={12} className="text-muted hidden xl:block" />
        </button>
        {showUser && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)} />
            <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border shadow-xl z-50 py-1">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-[11px] text-muted truncate">{user?.email}</p>
                {businessName && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-accent truncate">
                    <Building2 size={11} className="flex-shrink-0" />
                    {businessName}
                  </p>
                )}
              </div>
              <Link
                href="/profile"
                onClick={() => setShowUser(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-surface transition-colors"
              >
                <UserCircle size={13} /> My Profile
              </Link>
              <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="flex min-h-11 w-full items-center gap-2 px-4 text-sm hover:bg-surface lg:hidden">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Light theme" : "Dark theme"}</button>
              <div className="border-t border-border px-4 py-2 lg:hidden"><label htmlFor="account-language" className="text-xs text-muted">Language</label><select id="account-language" className="pesaa-control mt-1" value={locale} onChange={(e) => { const choice = locales.find((l) => l.code === e.target.value); if (choice) setLocale(choice.code); }}>{locales.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
              {hasPermission("tenants:update") && (
                <Link
                  href="/settings"
                  onClick={() => setShowUser(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-surface transition-colors"
                >
                  Business Settings
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
    <NavigationSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    <Drawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications" side="bottom"><div className="space-y-3 p-4"><p className="text-sm text-muted">Follow your support requests and work awaiting a decision.</p><Link href="/support" onClick={() => setNotificationsOpen(false)} className="flex min-h-11 items-center text-sm font-semibold text-accent">View support requests</Link>{hasPermission("approvals:read") && <Link href="/approvals" onClick={() => setNotificationsOpen(false)} className="flex min-h-11 items-center text-sm font-semibold text-accent">View approvals</Link>}</div></Drawer>
    </>
  );
}
