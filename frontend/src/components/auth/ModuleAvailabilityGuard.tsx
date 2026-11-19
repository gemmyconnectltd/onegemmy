"use client";

import { useEffect, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { useMyEntitlements } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { firstAllowedHref } from "@/lib/navigation";
import { accessForPath, featureForPath } from "@/lib/moduleAvailability";
import { partForPath, readOnlyMessage, readOnlyReason } from "@/lib/featureParts";

/** Disabled and unauthorized destinations never render a lock page or mount their content. */
export function ModuleAvailabilityGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, hasPermission, hasModuleAccess, isSuperAdmin } = useAuth();
  const entitlements = useMyEntitlements({ enabled: !!user?.tenantId });
  const owner = isSuperAdmin();
  const need = accessForPath(pathname);
  const target = featureForPath(pathname);
  const denied = !!need && ((need.ownerOnly && !owner) || (!!need.module && !hasModuleAccess(need.module)) || (!!need.permission && !hasPermission(need.permission)));
  const waiting = isLoading || (!!user?.tenantId && entitlements.isPending);
  const disabled = !!target && !!entitlements.data && entitlements.data.features[target.key] !== true;
  const destination = !waiting && (denied || disabled)
    ? firstAllowedHref(entitlements.data?.features, hasModuleAccess, hasPermission, owner)
    : null;

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    else if (destination && destination !== pathname) router.replace(destination);
  }, [destination, pathname, router, user, isLoading]);

  if (waiting || !user || destination) return <PageLoader variant="compact" />;
  if (target && entitlements.isError && !entitlements.data) return (
    <div role="alert" className="space-y-3 p-4"><p className="text-sm text-muted">Could not refresh your workspace features.</p><Button variant="outline" onClick={() => void entitlements.refetch()}>Try again</Button></div>
  );
  const readOnly = readOnlyReason(pathname, entitlements.data?.parts);
  const part = readOnly ? partForPath(pathname) : null;
  return <>
    {readOnly && part && <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground">
      <Lock size={16} aria-hidden className="mt-0.5 flex-shrink-0 text-[var(--warning)]" />
      <p><strong className="font-semibold">Read-only.</strong> {readOnlyMessage(part.name, readOnly)}</p>
    </div>}
    {children}
  </>;
}
