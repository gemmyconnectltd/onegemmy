"use client";

import { Search, Bell, Settings, LogOut, Menu, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-border z-50 flex items-center px-4 gap-4">
      {/* Left: Toggle */}
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Center: Search */}
      <div className="flex-1 max-w-md mx-auto hidden md:block">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-1.5 bg-surface border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button className="w-8 h-8 flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface rounded-lg transition-colors relative">
          <Bell size={18} />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface rounded-lg transition-colors">
          <Settings size={18} />
        </button>

        {/* User menu */}
        <div className="relative ml-2">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-2 py-1 hover:bg-surface rounded-lg transition-colors"
          >
            <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.split(" ").map((n) => n[0]).join("") || "U"}
            </div>
            <span className="text-sm font-medium text-foreground hidden sm:block">{user?.name || "User"}</span>
            <ChevronDown size={14} className="text-muted" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border shadow-lg z-50 py-1">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted">{user?.email}</p>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1 inline-block font-medium">
                    {user?.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
