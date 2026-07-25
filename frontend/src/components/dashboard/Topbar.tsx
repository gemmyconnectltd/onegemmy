"use client";

import { Bell, LogOut, Menu, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TopbarProps {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
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
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface rounded-lg transition-colors"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
            <span className="text-white text-[11px] font-bold">O</span>
          </div>
          <span className="text-sm font-bold text-foreground">OneGemmy</span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button className="w-8 h-8 flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface rounded-lg transition-colors relative">
          <Bell size={18} />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
        </button>

        <div className="relative ml-1">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-2 py-1 hover:bg-surface rounded-lg transition-colors"
          >
            <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-[11px] font-bold text-white">
              {user?.name?.split(" ").map((n) => n[0]).join("") || "O"}
            </div>
            <span className="text-[13px] font-medium text-foreground hidden sm:block max-w-[100px] truncate">{user?.name}</span>
            <ChevronDown size={12} className="text-muted hidden sm:block" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border shadow-lg z-50 py-1">
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-sm font-medium text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
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
