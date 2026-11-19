"use client";

import { useState } from "react";
import type { ActionRule, FeatureAction, FeatureControl } from "@/lib/api/admin";
import { useSetFeatureActions } from "@/lib/api/hooks";
import { ReasonDialog } from "@/components/features/ReasonDialog";
import { UsageCard } from "@/components/usage/UsageShared";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { ACTION_META, errorText } from "./status";
import { RuleEditor, ruleLabel, sameRule } from "./RuleEditor";

/** Which actions are open in this feature, on top of each business's own role permissions. */
export function ActionsPanel({ c }: { c: FeatureControl }) {
  const save = useSetFeatureActions();
  const [draft, setDraft] = useState<Record<FeatureAction, ActionRule>>(c.actions);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = (Object.keys(draft) as FeatureAction[]).filter((a) => !sameRule(draft[a], c.actions[a]));

  const submit = async (reason: string) => {
    setError(null);
    try { await save.mutateAsync({ key: c.key, actions: Object.fromEntries(changed.map((a) => [a, draft[a]])), reason }); setOpen(false); }
    catch (e: unknown) { setError(errorText(e)); }
  };

  return <div className="space-y-4">
    <DataCard label="Actions">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead><tr className="border-b border-border"><th scope="col" className={thClass}>Action</th><th scope="col" className={thClass}>Who may do it</th></tr></thead>
        <tbody className="divide-y divide-border">
          <tr><td className="px-4 py-3"><p className="font-semibold">View</p><p className="text-[12px] text-muted">Open and look up records</p></td><td className="px-4 py-3 text-[13px] text-muted">Always allowed for roles with access, so records can be reconciled</td></tr>
          {(Object.keys(ACTION_META) as FeatureAction[]).map((a) => <tr key={a} className={!sameRule(draft[a], c.actions[a]) ? "bg-accent/5" : undefined}>
            <td className="px-4 py-3"><p className="font-semibold">{ACTION_META[a].label}</p><p className="text-[12px] text-muted">{ACTION_META[a].detail}</p></td>
            <td className="px-4 py-3"><RuleEditor label={`Who may ${ACTION_META[a].label.toLowerCase()}`} value={draft[a]} onChange={(v) => setDraft({ ...draft, [a]: (v ?? "everyone") as ActionRule })} /></td>
          </tr>)}
        </tbody>
      </table>
    </DataCard>
    <UsageCard title="How this works" subtitle="Three layers decide every action">
      <ul className="space-y-1.5 py-1 text-[13px] text-muted">
        <li><strong className="text-foreground">Here</strong>: Pesaa opens an action, limits it to owners and administrators or to named roles, or switches it off, for every business. One business can get its own rule under Exceptions.</li>
        <li><strong className="text-foreground">Role permissions</strong>: each business still decides which of its roles get the action.</li>
        <li><strong className="text-foreground">Submodules</strong>: a rule on a module or submodule also applies to every feature inside it.</li>
      </ul>
    </UsageCard>
    <div className="flex gap-2">
      <Button disabled={!changed.length} onClick={() => { setError(null); setOpen(true); }}>Save {changed.length || ""} change{changed.length === 1 ? "" : "s"}…</Button>
      {changed.length > 0 && <Button variant="ghost" onClick={() => setDraft(c.actions)}>Reset</Button>}
    </div>
    {open && <ReasonDialog title={`Change actions in ${c.name}?`}
      message={changed.map((a) => `${ACTION_META[a].label}: ${ruleLabel(draft[a])}`).join(" · ")}
      confirmLabel="Save" danger={changed.some((a) => draft[a] === "off")} pending={save.isPending} error={error}
      onSubmit={(r) => void submit(r)} onClose={() => setOpen(false)} />}
  </div>;
}
