import { Badge, type Tone } from "@/components/ui/Badge";
import { tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";

const TONE: Record<ReturnType<typeof tenantStatusLabel>, Tone> = { Active: "green", "Pending Approval": "amber", Suspended: "red", Archived: "slate" };

/** Account status (can the business sign in?) — distinct from the billing/subscription state. */
export function TenantStatusBadge({ tenant, className }: { tenant: Pick<AdminTenant, "is_active" | "subscription_status" | "archived_at">; className?: string }) {
  const label = tenantStatusLabel(tenant);
  return <Badge tone={TONE[label]} dot className={className}>{label}</Badge>;
}

export function TenantLogo({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const box = { width: size, height: size };
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" style={box} className="flex-shrink-0 rounded-xl border border-border object-cover" />;
  return <span style={box} className="flex flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-[13px] font-bold text-accent">{name.trim().charAt(0).toUpperCase() || "?"}</span>;
}
