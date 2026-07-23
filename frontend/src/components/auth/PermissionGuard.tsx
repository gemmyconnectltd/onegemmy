"use client";

import { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Shield, Lock } from "lucide-react";

interface PermissionGuardProps {
  children: ReactNode;
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  module?: string;
  role?: string[];
  fallback?: ReactNode;
}

export function PermissionGuard({
  children,
  permission,
  permissions,
  requireAll = false,
  module,
  role,
  fallback,
}: PermissionGuardProps) {
  const { user, hasPermission, hasAnyPermission, hasModuleAccess, isSuperAdmin } = useAuth();

  if (!user) return <AccessDenied reason="Not authenticated" />;

  if (isSuperAdmin()) return <>{children}</>;

  if (role && !role.includes(user.platformRole) && !role.includes(user.roleId)) {
    return fallback ?? <AccessDenied reason="Insufficient role" />;
  }

  if (module && !hasModuleAccess(module)) {
    return fallback ?? <AccessDenied reason={`No access to ${module}`} />;
  }

  if (permission && !hasPermission(permission)) {
    return fallback ?? <AccessDenied reason="Missing permission" />;
  }

  if (permissions) {
    const hasAccess = requireAll
      ? permissions.every((p) => hasPermission(p))
      : hasAnyPermission(permissions);
    if (!hasAccess) {
      return fallback ?? <AccessDenied reason="Missing permissions" />;
    }
  }

  return <>{children}</>;
}

function AccessDenied({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Shield size={28} className="text-red-500" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-1">Access Denied</h3>
      <p className="text-sm text-muted max-w-sm">{reason}. Contact your administrator to request access.</p>
    </div>
  );
}

export function useCanDo(permissionId: string): boolean {
  const { hasPermission, isSuperAdmin } = useAuth();
  if (isSuperAdmin()) return true;
  return hasPermission(permissionId);
}

export function ModuleGuard({ module, children }: { module: string; children: ReactNode }) {
  const { hasModuleAccess, isSuperAdmin } = useAuth();
  if (isSuperAdmin()) return <>{children}</>;
  if (!hasModuleAccess(module)) return null;
  return <>{children}</>;
}
