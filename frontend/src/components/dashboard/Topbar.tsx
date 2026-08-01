"use client";

import { Bell, Menu, ChevronDown, Search, Loader2, Globe, Store, Moon, Sun, LogOut } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppConfig } from "@/lib/appConfig";

interface TopbarProps {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
}

function getBreadcrumb(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { user } = useAuth();
  const { translating, locale, setLocale, locales, theme, setTheme } = useAppConfig();
  const pathname = usePathname();
  const [showLang, setShowLang] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const router = useRouter();
  const { logout } = useAuth();
  const breadcrumb = getBreadcrumb(pathname);

  const handleLogout = () => {
    setShowUser(false);
    logout();
    router.push("/login");
  };

  return (
    <header className="h-14 bg-card/95 backdrop-blur-sm border-b border-border flex items-center px-4 gap-3 sticky top-0 z-30">
      {/* Mobile menu toggle */}
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors lg:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <div className="hidden sm:flex items-center gap-1.5 text-[14px]">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-border">/</span>}
            <span className={i === breadcrumb.length - 1 ? "font-semibold text-foreground" : "text-muted"}>
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

      <div className="flex-1" />

      {/* POS */}
      <Link
        href="/pos"
        className={`flex items-center gap-2 px-3.5 h-8 text-[13px] font-bold rounded-lg transition-colors flex-shrink-0 ${
          pathname === "/pos"
            ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/30"
            : "bg-accent text-white hover:bg-accent/90"
        }`}
      >
        <Store size={15} />
        <span className="hidden sm:inline">POS</span>
      </Link>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 border border-border bg-surface/60 hover:bg-surface px-3 py-1.5 text-[13px] text-muted hover:border-foreground/20 transition-all cursor-pointer w-56 rounded-lg">
        <Search size={13} />
        <span className="text-[13px] flex-1">Search...</span>
        <span className="text-[10px] bg-card border border-border px-1.5 py-0.5 text-muted/60 font-mono rounded">⌘K</span>
      </div>

      {/* Notifications */}
      <button className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors relative" title="Notifications">
        <Bell size={16} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-card" />
      </button>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Language switcher */}
      <div className="relative">
        <button
          onClick={() => { setShowLang((v) => !v); setShowUser(false); }}
          className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
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
          className="flex items-center gap-2 pl-2 border-l border-border hover:opacity-80 transition-opacity"
        >
          <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-[13px] font-semibold text-foreground leading-tight max-w-[100px] truncate">{user?.name}</p>
            <p className="text-[11px] text-muted leading-tight capitalize">{user?.role}</p>
          </div>
          <ChevronDown size={12} className="text-muted hidden sm:block" />
        </button>
        {showUser && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)} />
            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border shadow-xl z-50 py-1">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-[11px] text-muted capitalize">{user?.role}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setShowUser(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-surface transition-colors"
              >
                Settings
              </Link>
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
  );
}
