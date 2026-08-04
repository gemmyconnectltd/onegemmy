"use client";

import { useRouter } from "next/navigation";
import { Building2, LogOut, Mail, Shield, UserRound } from "lucide-react";

import { useAuth } from "@/lib/auth";

export default function MobileAccountPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.replace("/m/login");
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Account</h1>
      </header>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Profile card */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center">
              <UserRound size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-foreground truncate">
                {user?.name ?? "Cashier"}
              </p>
              <p className="text-[11px] text-muted truncate flex items-center gap-1">
                <Mail size={10} /> {user?.email}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted flex items-center gap-1.5">
                <Building2 size={12} /> Tenant
              </span>
              <span className="font-semibold text-foreground">{user?.tenantName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted flex items-center gap-1.5">
                <Shield size={12} /> Role
              </span>
              <span className="font-semibold text-foreground capitalize">{user?.role ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => router.push("/pos")}
            className="w-full text-left px-4 py-3.5 text-[13px] font-medium text-foreground hover:bg-surface transition-colors"
          >
            Open full POS
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full text-left px-4 py-3.5 text-[13px] font-medium text-foreground hover:bg-surface transition-colors border-t border-border"
          >
            Open dashboard
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 text-red-600 text-[13px] font-bold active:scale-[0.98] transition"
        >
          <LogOut size={15} /> Log out
        </button>
      </div>
    </div>
  );
}
