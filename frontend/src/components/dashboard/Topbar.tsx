"use client";

import { Bell, Menu, ChevronDown, Search, Loader2, Globe } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { usePathname } from "next/navigation";
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
  const { translating, locale, setLocale, locales } = useAppConfig();
  const pathname = usePathname();
  const [showSearch, setShowSearch] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const breadcrumb = getBreadcrumb(pathname);

  return (
    <header className="h-14 bg-white border-b border-border flex items-center px-4 gap-4 sticky top-0 z-30">
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

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 border border-border px-3 py-1.5 text-[13px] text-muted hover:border-foreground/20 transition-colors cursor-pointer w-52">
        <Search size={14} />
        <span className="text-[13px]">Search...</span>
        <span className="ml-auto text-[11px] bg-surface px-1.5 py-0.5 text-muted/60 font-mono">⌘K</span>
      </div>

      {/* Notifications */}
      <button className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors relative">
        <Bell size={17} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-accent rounded-full" />
      </button>

      {/* Language switcher */}
      <div className="relative">
        <button
          onClick={() => setShowLang((v) => !v)}
          className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
          title="Change language"
        >
          <Globe size={16} />
        </button>
        {showLang && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-border shadow-lg z-50 min-w-[150px]">
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
        )}
      </div>

      {/* User */}
      <div className="flex items-center gap-2 pl-2 border-l border-border">
        <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
          {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
        </div>
        <div className="hidden sm:block">
          <p className="text-[13px] font-semibold text-foreground leading-tight max-w-[100px] truncate">{user?.name}</p>
          <p className="text-[11px] text-muted leading-tight capitalize">{user?.role}</p>
        </div>
        <ChevronDown size={12} className="text-muted hidden sm:block" />
      </div>
    </header>
  );
}
