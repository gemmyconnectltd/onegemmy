"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config";

// The public website lives in its own project (pesaa.io). This deployment is the product, so its root just sends
// people where they belong: the dashboard when signed in, the sign-in page otherwise.
export default function Home() {
  // Only the session decides where to go; the dashboard checks access itself, so don't wait for that here as well.
  const { user, sessionLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [sessionLoading, user, router]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <PageLoader variant="screen" label={siteConfig.name} sub="Loading your business dashboard" />
    </div>
  );
}
