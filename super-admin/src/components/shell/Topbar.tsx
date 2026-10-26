"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { breadcrumbFor } from "./nav";

export function Topbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useAppConfig();
  const pathname = usePathname();
  const router = useRouter();
  const [showUser, setShowUser] = useState(false);
  const crumbs = breadcrumbFor(pathname);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showUser) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowUser(false); menu.current?.querySelector("button")?.focus(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [showUser]);

  const signOut = () => { setShowUser(false); logout(); router.replace("/login"); };

  return (
    <header className="h-14 bg-card/95 backdrop-blur-sm border-b border-border flex items-center px-4 gap-3 sticky top-0 z-30">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[14px] min-w-0"><ol className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, i) => (
          <li key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span aria-hidden className="hidden text-border sm:inline">/</span>}
            <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "font-semibold text-foreground truncate" : "text-muted hidden sm:inline"}>{crumb}</span>
          </li>
        ))}
      </ol></nav>
      <div className="flex-1" />
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="w-8 h-8 flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="relative" ref={menu}>
        <button onClick={() => setShowUser((v) => !v)} aria-expanded={showUser} aria-haspopup="menu" aria-label="Account menu" className="flex items-center gap-2 pl-2 border-l border-border hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-[13px] font-semibold text-foreground leading-tight max-w-[120px] truncate">{user?.name}</p>
            <p className="text-[11px] text-muted leading-tight">Platform admin</p>
          </div>
          <ChevronDown size={12} className="text-muted hidden sm:block" />
        </button>
        {showUser && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)} />
            <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border shadow-xl z-50 py-1 rounded-lg">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-[11px] text-muted truncate">{user?.email}</p>
              </div>
              <button onClick={signOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground/70 hover:bg-surface transition-colors">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
