"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
      <div className="min-h-dvh bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
