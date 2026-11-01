import type { User } from "./auth";
import type { ApiUser } from "./api/users";

/** Current server grants override token snapshots, including explicit revocations. */
export function currentSessionUser(session: User | null, profile: ApiUser | undefined): User | null {
  if (!session || !profile || profile.id !== session.id || profile.tenant_id !== session.tenantId) return session;
  const branchIds = profile.branch_ids;
  const branchId = branchIds && branchIds.length > 1 ? null : profile.branch_id ?? branchIds?.[0] ?? null;
  return {
    ...session,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    roleId: profile.role_id,
    isSuperuser: profile.is_superuser,
    tenantName: profile.tenant_name,
    branchIds,
    branchId,
    branchName: branchId === session.branchId ? session.branchName : null,
    permissions: profile.permissions ?? [],
    disabledModules: profile.disabled_modules ?? [],
  };
}
