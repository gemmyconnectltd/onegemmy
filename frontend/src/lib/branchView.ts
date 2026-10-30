/** Pure rules behind the Branch Management pages, kept apart from React so they can be tested. */

export type BranchForm = { name: string; location: string; phone: string; email: string; status: "active" | "inactive" };
export const EMPTY_BRANCH: BranchForm = { name: "", location: "", phone: "", email: "", status: "active" };

export type BranchErrors = Partial<Record<"name" | "email" | "phone", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d][\d\s().-]{5,}$/;

/** Inline validation. `others` are the names of the business's other branches (a name may not repeat, ignoring case and spacing). */
export function validateBranch(form: BranchForm, others: string[]): BranchErrors {
  const errors: BranchErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Give the branch a name.";
  else if (others.some((n) => n.trim().toLowerCase() === name.toLowerCase())) errors.name = "Another branch already has this name.";
  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (form.phone.trim() && !PHONE.test(form.phone.trim())) errors.phone = "Enter a phone number, e.g. +250 788 000 000.";
  return errors;
}

export function isDirty(form: BranchForm, initial: BranchForm): boolean {
  return (Object.keys(initial) as (keyof BranchForm)[]).some((k) => form[k].trim() !== initial[k].trim());
}

/** What the server said, in a form the page can act on: a plan limit gets an upgrade path, the rest is shown as it is. */
export function branchProblem(err: unknown): { kind: "limit" | "other"; message: string } {
  const e = err as { status?: number; detail?: string; message?: string };
  const message = e?.detail ?? e?.message ?? "Something went wrong. Try again.";
  return { kind: e?.status === 429 || /limit/i.test(message) ? "limit" : "other", message };
}

export type PeriodPreset = "today" | "week" | "month" | "custom";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The dates for a preset, in the viewer's calendar: today, the last 7 days (including today) or this month so far. */
export function presetRange(preset: Exclude<PeriodPreset, "custom">, now: Date = new Date()): { from: string; to: string } {
  const to = iso(now);
  if (preset === "today") return { from: to, to };
  if (preset === "week") { const s = new Date(now); s.setDate(s.getDate() - 6); return { from: iso(s), to }; }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
}

/** "+12.5% vs previous period", or an honest note when there is nothing to compare with. */
export function growthText(pct: number | null | undefined): { text: string; tone: "up" | "down" | "flat" | "none" } {
  if (pct == null) return { text: "No sales in the previous period to compare with", tone: "none" };
  if (pct === 0) return { text: "Same as the previous period", tone: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs previous period`, tone: pct > 0 ? "up" : "down" };
}

/** What deactivating a branch means for the people and records around it, before the administrator confirms. */
export function deactivationNotes(branch: { is_main: boolean }, staff: number): string[] {
  const notes = ["Its sales, stock transfers and expenses stay in your history and reports."];
  if (staff > 0) notes.push(`${staff} ${staff === 1 ? "person is" : "people are"} assigned to it. They keep their accounts but can't work in a deactivated branch until it is reactivated or they are moved.`);
  if (branch.is_main) notes.push("This is the main branch. Make another branch the main one first.");
  return notes;
}

/** A person's new branch list when they are assigned to `branchId` (they keep the branches they already have). */
export function withBranch(current: string[], branchId: string): { branch_ids: string[]; branch_id: string } {
  const ids = current.includes(branchId) ? current : [...current, branchId];
  return { branch_ids: ids, branch_id: ids[0] };
}

/** Their list once removed from `branchId`. Removing the last branch leaves an explicit empty list (they can't act anywhere until
 *  reassigned), never "no limit": clearing the list entirely would silently give them every branch. */
export function withoutBranch(current: string[], branchId: string): { branch_ids: string[]; branch_id: string | null } {
  const ids = current.filter((id) => id !== branchId);
  return { branch_ids: ids, branch_id: ids[0] ?? null };
}
