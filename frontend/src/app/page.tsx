"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config";

// The public website lives in its own project (pesaa.io). This deployment is the product, so its root just sends
// people where they belong: the dashboard when signed in, the sign-in page otherwise.
export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label={siteConfig.name} sub="Loading your business dashboard" />
    </div>
  );
}
