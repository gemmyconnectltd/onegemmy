"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useMyEntitlements } from "@/lib/api/hooks";
import { featureForPath } from "@/lib/moduleAvailability";
import { noticeFor, partForPath, readOnlyReason } from "@/lib/featureParts";

export type FeatureActionKey = "create" | "edit" | "delete" | "approve" | "import" | "export";
const WRITES: FeatureActionKey[] = ["create", "edit", "delete", "approve", "import"];

/** Which actions Pesaa's controls block on the current page (module and part), and why. Shared buttons use it to
 *  hide or disable themselves; the server refuses the same actions either way. */
export function useFeatureActions(): { blocked: Set<FeatureActionKey>; reason: string | null } {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data } = useMyEntitlements({ enabled: !!user?.tenantId });
  const blocked = new Set<FeatureActionKey>();
  const moduleKey = featureForPath(pathname)?.key ?? null;
  const part = partForPath(pathname);
  for (const key of [moduleKey, part?.key]) {
    const c = key ? data?.controls?.[key] : undefined;
    if (!c) continue;
    if (!c.writable) WRITES.forEach((a) => blocked.add(a));
    c.blocked_actions.forEach((a) => blocked.add(a as FeatureActionKey));
  }
  if (readOnlyReason(pathname, data?.parts)) WRITES.forEach((a) => blocked.add(a));
  const notice = blocked.size ? noticeFor(pathname, moduleKey, data?.parts, data?.controls) : null;
  return { blocked, reason: notice?.message ?? (blocked.size ? "This action is switched off here by Pesaa." : null) };
}

const METHOD_PARTS: Record<string, string> = { cash: "pos.cash", mobile: "pos.mobile_money", card: "pos.card" };

/** Payment methods Pesaa has switched off (or not opened to this business) at the till. The server refuses them too. */
export function useDisabledPayMethods(): Set<string> {
  const { user } = useAuth();
  const { data } = useMyEntitlements({ enabled: !!user?.tenantId });
  const off = new Set<string>();
  const group = data?.controls?.["pos.payments"];
  for (const [method, key] of Object.entries(METHOD_PARTS)) {
    const c = data?.controls?.[key];
    if ((c && (!c.visible || !c.writable)) || (group && (!group.visible || !group.writable)) || data?.parts?.[key] === "restricted" || data?.parts?.[key] === "switched_off") off.add(method);
  }
  return off;
}
