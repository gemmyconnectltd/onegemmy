import { Badge, type Tone } from "@/components/ui/Badge";
import type { AgentAvailability, ConversationStatus, Priority, WhatsAppStatus } from "@/lib/support/types";

const CONVERSATION: Record<ConversationStatus, [string, Tone]> = { open: ["Open", "green"], pending: ["Pending", "amber"], resolved: ["Resolved", "slate"], snoozed: ["Snoozed", "violet"] };
const PRIORITY: Record<Priority, [string, Tone]> = { low: ["Low", "slate"], normal: ["Normal", "blue"], high: ["High", "amber"], urgent: ["Urgent", "red"] };
const TEMPLATE: Record<WhatsAppStatus, [string, Tone]> = { draft: ["Draft", "slate"], pending: ["Pending approval", "amber"], approved: ["Approved", "green"], rejected: ["Rejected", "red"] };
const AVAILABILITY: Record<AgentAvailability, [string, Tone]> = { online: ["Online", "green"], away: ["Away", "amber"], offline: ["Offline", "slate"] };

export type BadgeKind =
  | { status: ConversationStatus } | { priority: Priority } | { template: WhatsAppStatus } | { availability: AgentAvailability }
  | { active: boolean; archived?: boolean } | { label: string; tone?: Tone };

/** One small pill for every status-like value in Support, so colors mean the same thing on every screen. */
export function StatusBadge({ className, dot = false, ...kind }: BadgeKind & { className?: string; dot?: boolean }) {
  let label = "";
  let tone: Tone = "slate";
  if ("status" in kind) [label, tone] = CONVERSATION[kind.status];
  else if ("priority" in kind) [label, tone] = PRIORITY[kind.priority];
  else if ("template" in kind) [label, tone] = TEMPLATE[kind.template];
  else if ("availability" in kind) [label, tone] = AVAILABILITY[kind.availability];
  else if ("active" in kind) [label, tone] = kind.archived ? ["Archived", "slate"] : kind.active ? ["Active", "green"] : ["Inactive", "amber"];
  else { label = kind.label; tone = kind.tone ?? "slate"; }
  return <Badge tone={tone} dot={dot} className={className}>{label}</Badge>;
}
