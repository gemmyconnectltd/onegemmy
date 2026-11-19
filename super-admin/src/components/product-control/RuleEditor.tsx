"use client";

import type { ActionRule, FeatureImpact } from "@/lib/api/admin";
import { Input, Select } from "@/components/ui/Form";

const COMMON_ROLES = ["Branch manager", "Accountant", "Cashier", "Inventory officer", "Member"];

export function ruleLabel(rule: ActionRule | undefined): string {
  if (rule === undefined) return "Same as every business";
  if (typeof rule === "object") return `Only: ${rule.roles.join(", ")}`;
  return { everyone: "Anyone whose role allows it", admins: "Owners & administrators only", off: "Switched off" }[rule];
}

export const sameRule = (a: ActionRule | undefined, b: ActionRule | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Who may take one action: every role, owners & admins, named roles, or nobody. With `inherit`, an empty choice means
 *  "same as every business" (for a business's exception). */
export function RuleEditor({ value, onChange, label, inherit }: { value: ActionRule | undefined; onChange: (v: ActionRule | undefined) => void; label: string; inherit?: boolean }) {
  const kind = value === undefined ? "" : typeof value === "object" ? "roles" : value;
  const roles = typeof value === "object" ? value.roles : [];
  const setRoles = (list: string[]) => onChange({ roles: [...new Set(list.map((r) => r.trim()).filter(Boolean))] });
  return <div className="space-y-2">
    <Select aria-label={label} value={kind} className="max-w-xs" onChange={(e) => {
      const v = e.target.value;
      onChange(v === "" ? undefined : v === "roles" ? { roles: roles.length ? roles : ["Branch manager"] } : (v as ActionRule));
    }}>
      {inherit && <option value="">Same as every business</option>}
      <option value="everyone">Anyone whose role allows it</option>
      <option value="admins">Owners &amp; administrators only</option>
      <option value="roles">Only these roles…</option>
      <option value="off">Switched off</option>
    </Select>
    {kind === "roles" && <div className="space-y-2">
      <Input aria-label={`${label}: roles`} value={roles.join(", ")} onChange={(e) => setRoles(e.target.value.split(","))} placeholder="Role names, separated by commas" />
      <div className="flex flex-wrap gap-1.5">{COMMON_ROLES.map((r) => {
        const on = roles.some((x) => x.toLowerCase() === r.toLowerCase());
        return <button key={r} type="button" aria-pressed={on} onClick={() => setRoles(on ? roles.filter((x) => x.toLowerCase() !== r.toLowerCase()) : [...roles, r])}
          className={"rounded-md border px-2 py-1 text-[12px] " + (on ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}>{r}</button>;
      })}</div>
      <p className="text-[11px] text-muted">Matched by role name in each business. Owners and administrators can always do it.</p>
    </div>}
  </div>;
}

/** One line on who a change reaches, for confirm dialogs. */
export function ImpactNote({ impact }: { impact: FeatureImpact }) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px]">
    <p><strong>{impact.entitled}</strong> business{impact.entitled === 1 ? "" : "es"} have the module in their plan · <strong>{impact.active_30d}</strong> made changes here in the last 30 days{impact.records_in_module !== null ? <> · <strong>{impact.records_in_module}</strong> have records in it</> : null}.</p>
    {(impact.cohort > 0 || impact.exceptions > 0) && <p className="mt-1 text-muted">{impact.cohort} in the cohort · {impact.exceptions} business exception{impact.exceptions === 1 ? "" : "s"} (they keep their own setting).</p>}
    {impact.dependents.length > 0 && <p className="mt-1 text-[var(--warning)]">Also affects what relies on it: {impact.dependents.map((d) => d.name).join(", ")}.</p>}
    {impact.parts_inside > 0 && <p className="mt-1 text-muted">Covers {impact.parts_inside} part{impact.parts_inside === 1 ? "" : "s"} inside it.</p>}
  </div>;
}
