"use client";

import { Building2, Mail, Phone, User, Shield, Clock, LogIn, Briefcase } from "lucide-react";
import type { ApiUser } from "@/lib/api";

/** Shared display bits for a user profile. Used by both "My Profile"
 *  (/settings/profile) and the admin View-Profile drawer, so a user always
 *  sees the same fields in the same order wherever their profile appears. */

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function UserAvatar({ name, color, size = 40 }: { name?: string | null; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

export const ROLE_BADGE: Record<string, string> = {
  owner: "bg-violet-50 text-violet-700",
  admin: "bg-blue-50 text-blue-700",
  member: "bg-surface text-foreground/70",
  viewer: "bg-surface text-muted",
};

export function roleBadgeClass(role: string): string {
  return ROLE_BADGE[(role || "").toLowerCase()] ?? "bg-surface text-foreground/70";
}

export function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
        isActive ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"
      }`}
    >
      {isActive ? "Active" : "Deactivated"}
    </span>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof User;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2 text-[12px] text-muted flex-shrink-0 pt-0.5">
        <Icon size={13} />
        {label}
      </div>
      <span
        className={`text-[13px] font-semibold text-right break-words min-w-0 ${
          mono ? "font-mono" : ""
        } ${empty ? "text-muted/60 font-normal" : "text-foreground"}`}
      >
        {value || "Not set"}
      </span>
    </div>
  );
}

/** The four fields the product spec requires on every profile — company,
 *  name, email, phone — followed by access metadata. */
export function ProfileDetails({
  user,
  businessPhone,
}: {
  user: ApiUser;
  /** Falls back to the company main line when the person has no personal
   *  number on file. The two are genuinely different fields: `user.phone` is
   *  the individual's, `tenant.phone` is the business's. */
  businessPhone?: string | null;
}) {
  const phone = user.phone || businessPhone;
  const phoneIsBusinessFallback = !user.phone && !!businessPhone;

  return (
    <div className="bg-surface rounded-xl p-4 space-y-3.5">
      <Row icon={Building2} label="Company Name" value={user.tenant_name} />
      <Row icon={User} label="User Name" value={user.full_name} />
      <Row icon={Mail} label="Email Address" value={user.email} mono />
      <div>
        <Row icon={Phone} label="Phone Number" value={phone} mono />
        {phoneIsBusinessFallback && (
          <p className="text-[11px] text-muted/70 mt-1 text-right">
            Showing the company&apos;s main line — add a personal number to override it.
          </p>
        )}
      </div>

      <div className="border-t border-border pt-3.5 space-y-3.5">
        <Row icon={Shield} label="Role" value={user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : null} />
        <Row icon={Briefcase} label="Permissions" value={user.permissions.length ? `${user.permissions.length} granted` : "None"} />
        <Row
          icon={LogIn}
          label="Last Sign-In"
          value={user.last_login ? new Date(user.last_login).toLocaleString() : "Never signed in"}
        />
        <Row
          icon={Clock}
          label="Added"
          value={user.created_at ? new Date(user.created_at).toLocaleDateString() : null}
        />
      </div>
    </div>
  );
}
