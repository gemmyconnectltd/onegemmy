"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/PageLoader";
import { visibleModuleLinks } from "@/lib/navigation";
import { useAuth } from "@/lib/auth";

// Accounting opens on the first page this person is allowed to see, not on one they would be refused.
export default function AccountingHome() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const first = visibleModuleLinks("accounting", hasPermission)[0];
  useEffect(() => { if (first) router.replace(first.href); }, [first, router]);
  if (first) return <PageLoader variant="compact" />;
  return <p role="alert" className="py-16 text-center text-sm text-muted">Your role has no access to accounting pages. Ask an administrator of your business if you need them.</p>;
}
