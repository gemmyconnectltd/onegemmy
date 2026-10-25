import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/Badge";
import type { CampaignStatus, ContactStatus } from "@/lib/api";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" }, scheduled: { label: "Scheduled", tone: "blue" }, sending: { label: "Sending", tone: "amber" },
  sent: { label: "Sent", tone: "green" }, paused: { label: "Paused", tone: "amber" }, cancelled: { label: "Cancelled", tone: "slate" },
  failed: { label: "Failed", tone: "red" }, active: { label: "Active", tone: "green" },
};
export const CONTACT_STATUS: Record<ContactStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "green" }, unsubscribed: { label: "Unsubscribed", tone: "slate" }, bounced: { label: "Bounced", tone: "red" },
  complained: { label: "Complained", tone: "red" }, invalid: { label: "Invalid email", tone: "red" },
};
export const TYPE_LABEL: Record<string, string> = { promotional: "Promotional", announcement: "Announcement", product_update: "Product update", newsletter: "Newsletter" };
export const CATEGORY_LABEL: Record<string, string> = { campaign: "Marketing campaign", newsletter: "Newsletter", onboarding: "Welcome & onboarding", announcement: "Announcement", transactional: "Transactional" };

export const StatusPill = ({ status }: { status: CampaignStatus }) => <Badge tone={CAMPAIGN_STATUS[status]?.tone ?? "slate"} dot>{CAMPAIGN_STATUS[status]?.label ?? status}</Badge>;
export const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: digits })}%`);
export const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"));
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** A short inline result message that is announced to screen readers. */
export function Flash({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return <p role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "text-[13px] text-red-600 dark:text-red-400" : "text-[13px] text-emerald-700 dark:text-emerald-400"}>{children}</p>;
}
