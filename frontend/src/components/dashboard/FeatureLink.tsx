"use client";
import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { useAuth } from "@/lib/auth";
import { useMyEntitlements } from "@/lib/api/hooks";
import { accessForPath, featureForPath } from "@/lib/moduleAvailability";

/** Dashboard shortcuts follow the same feature and permission gates as the menus. */
export function FeatureLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { user, hasPermission, hasModuleAccess, isSuperAdmin } = useAuth();
  const { data } = useMyEntitlements({ enabled: !!user?.tenantId });
  const feature = featureForPath(href);
  const need = accessForPath(href);
  if ((feature && data?.features[feature.key] !== true) ||
      (need?.ownerOnly && !isSuperAdmin()) ||
      (need?.module && !hasModuleAccess(need.module)) ||
      (need?.permission && !hasPermission(need.permission))) return null;
  return <Link href={href} {...props} />;
}
