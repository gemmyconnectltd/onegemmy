"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Lock, PackageX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMyEntitlements } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { firstAllowedHref } from "@/lib/navigation";
import { accessForPath, featureForPath, unavailableReason } from "@/lib/moduleAvailability";

/** Deep links to a module the business can't use land here instead of an empty or erroring page. The sidebar already hides the
 *  entry; the API refuses the same requests, so this is the explanation, not the security boundary. */
export function ModuleAvailabilityGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { hasPermission, hasModuleAccess, isSuperAdmin } = useAuth();
  const { data } = useMyEntitlements({ enabled: !isSuperAdmin() });
  const router = useRouter();
  const owner = isSuperAdmin();
  const need = owner ? null : accessForPath(pathname);
  const denied = !!need && (need.ownerOnly || (!!need.module && !hasModuleAccess(need.module)) || (!!need.permission && !hasPermission(need.permission)));
  // The Overview is the owner's home. Anyone else who lands there is sent to the first page their role gives them.
  const home = pathname === "/dashboard" && denied ? firstAllowedHref(data?.features, hasModuleAccess, hasPermission, owner) : null;
  useEffect(() => { if (home && home !== pathname) router.replace(home); }, [home, pathname, router]);
  if (home) return null;
  if (need && denied) {
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-muted"><Lock size={26} /></span>
        <h1 className="text-lg font-bold text-foreground">You don&apos;t have access to {need.name}</h1>
        <p className="mt-1 text-sm text-muted">{need.ownerOnly ? `${need.name} is for the business owner.` : "Your role doesn't include it. Ask an administrator of your business if you need it."}</p>
        <Link href={firstAllowedHref(data?.features, hasModuleAccess, hasPermission, owner)} className="mt-5"><Button variant="outline">Go to my work</Button></Link>
      </div>
    );
  }
  const target = featureForPath(pathname);
  if (!target || !data || data.features[target.key] !== false) return <>{children}</>;
  const status = data.modules?.[target.key];
  const reason = unavailableReason(target.name, status);
  const admin = hasPermission("tenants:update");
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-muted"><PackageX size={26} /></span>
      <h1 className="text-lg font-bold text-foreground">{target.name} isn&apos;t available</h1>
      <p className="mt-1 text-sm text-muted">{reason} {admin ? "You can change this below." : "Ask an administrator of your business if you need it."}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {admin && status === "available" && <Link href="/settings/features"><Button variant="default">Open Features &amp; Modules</Button></Link>}
        {admin && (status === "not_included" || !status) && <Link href="/settings/billing"><Button variant="default">See plans</Button></Link>}
        {status === "restricted" && <Link href="/support"><Button variant="default">Contact support</Button></Link>}
        <Link href="/dashboard"><Button variant="outline">Back to overview</Button></Link>
      </div>
    </div>
  );
}
