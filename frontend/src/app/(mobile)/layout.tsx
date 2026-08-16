"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { BottomNav } from "@/components/mobile/BottomNav";
import { MobilePosProvider } from "@/components/mobile/MobilePosProvider";
import { useAuth } from "@/lib/auth";

export default function MobileLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLogin = pathname === "/m/login";

  useEffect(() => {
    if (!isLoading && !user && !isLogin) router.replace("/m/login");
    if (!isLoading && user && isLogin) router.replace("/m");
  }, [isLoading, user, isLogin, router]);

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <MobilePosProvider>
      <div className="min-h-dvh bg-background flex justify-center">
        <div className="w-full max-w-[430px] h-dvh flex flex-col bg-background overflow-hidden">
          <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
          {!isLogin && <BottomNav />}
        </div>
      </div>
    </MobilePosProvider>
  );
}
