import type { AccessModule, AccessRow } from "./api/access";
import type { ModuleStatus } from "./api/tenants";

export type Tone = "green" | "slate" | "amber" | "red";

/** How a module reads for a person or role once permissions and the business's module state are both applied. */
export function moduleUse(m: Pick<AccessModule, "status" | "can_view" | "can_change" | "effective_view" | "effective_change">): { label: string; tone: Tone; reason: string } {
  if (m.effective_change) return { label: "Can use", tone: "green", reason: "Permissions allow changes and the module is on." };
  if (m.status === "not_included") return { label: "Not available", tone: "amber", reason: "The plan doesn't include this module." };
  if (m.status === "restricted") return { label: "Not available", tone: "red", reason: "Pesaa has paused this module for the business." };
  if (m.effective_view && m.status === "available") return { label: "View only", tone: "slate", reason: "The business turned this module off: past records stay readable, nothing new can be added." };
  if (m.effective_view) return { label: "View only", tone: "slate", reason: "Permissions only allow viewing." };
  if (!m.can_view && !m.can_change) return { label: "No access", tone: "slate", reason: "No permission for this module." };
  return { label: "Not available", tone: "slate", reason: "The module is not usable by the business right now." };
}

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  enabled: "On",
  available: "Turned off",
  not_included: "Not in plan",
  restricted: "Restricted by Pesaa",
};

/** A short readable list of the modules a person can open: first few names, then "+n more". */
export function moduleSummary(row: Pick<AccessRow, "modules">, names: Record<string, string>, show = 3): { shown: string[]; more: number } {
  const labels = row.modules.map((k) => names[k] ?? k);
  return { shown: labels.slice(0, show), more: Math.max(0, labels.length - show) };
}

/** Branch scope in words: every branch, the named ones, or none assigned yet (they can't act anywhere). */
export function branchLabel(all: boolean, branches: { name: string }[]): string {
  if (all) return "All branches";
  if (branches.length === 0) return "None assigned";
  return branches.map((b) => b.name).join(", ");
}
