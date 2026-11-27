"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/Form";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useAuth } from "@/lib/auth";
import { pickerKind } from "@/lib/api/branchStock";
import { confirmWorkspaceChange } from "@/lib/unsavedChanges";

const RECENT_KEY = "pesaa.inventory.recentBranches";

function readRecent(): string[] {
  try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
function remember(id: string) {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 4))); } catch { /* private window */ }
}

/** True when this person always works in one branch: no picker, the server ignores any other branch anyway. */
export function useFixedBranch(): boolean {
  const { user } = useAuth();
  return !!user?.branchId || (user?.branchIds?.length ?? 0) === 1;
}

type PickerBranch = { id: string; name: string; units?: number };

/** The one place to pick a branch on an inventory page, in the filter bar like every other list (Sales, Purchases). Hidden with
 *  one branch (or for someone tied to one); a short list for 2–5 branches; a searchable list with recent branches from 6.
 *  It drives the same branch as the top bar. */
export function BranchPicker({ branches, totalUnits, className = "min-w-0 flex-1 sm:w-48 sm:flex-none", value, onChange, allLabel = "All branches", label = "Branch" }: {
  branches: PickerBranch[]; totalUnits?: number; className?: string;
  /** Page-local mode: the page keeps its own branch (`value`, null = all) and the top bar's branch is left alone. */
  value?: string | null; onChange?: (id: string | null) => void; allLabel?: string; label?: string;
}) {
  const auth = useAuth();
  const local = onChange !== undefined;
  const activeBranchId = local ? value ?? null : auth.activeBranchId;
  const setActiveBranchId = local ? onChange : auth.setActiveBranchId;
  const fixed = useFixedBranch();
  const [query, setQuery] = useState("");
  const kind = pickerKind(branches.length);
  const recent = useMemo(() => (typeof window === "undefined" ? [] : readRecent()), [activeBranchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if ((fixed && !local) || kind === "hidden") return null;

  const choose = (id: string) => {
    const next = id || null;
    if (next === activeBranchId || (!local && !confirmWorkspaceChange())) return;
    if (next) remember(next);
    setActiveBranchId(next); // every branch-scoped query is reset (lib/api/branchScope.ts): nothing from the last branch shows
  };
  const current = branches.find((b) => b.id === activeBranchId)?.name ?? allLabel;
  const units = (n?: number) => (n === undefined ? "" : ` · ${n.toLocaleString()} units`);

  if (kind === "select") {
    return <Select aria-label={label} className={className} value={activeBranchId ?? ""} onChange={(e) => choose(e.target.value)}>
      <option value="">{allLabel}{units(totalUnits)}</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{units(b.units)}</option>)}
    </Select>;
  }
  const needle = query.trim().toLowerCase();
  const matching = branches.filter((b) => !needle || b.name.toLowerCase().includes(needle));
  const recentFirst = needle ? matching : [...recent.map((id) => matching.find((b) => b.id === id)).filter((b): b is PickerBranch => !!b),
    ...matching.filter((b) => !recent.includes(b.id))];
  return <SearchSelect label={label} className={className} value={activeBranchId ?? ""} selectedLabel={current} query={query} onQueryChange={setQuery}
      placeholder="Search branches…" emptyText="No branch has that name"
      items={[...(needle ? [] : [{ id: "", label: allLabel, hint: totalUnits === undefined ? "The business total" : `${totalUnits.toLocaleString()} units` }]),
        ...recentFirst.map((b) => ({ id: b.id, label: b.name, hint: [recent.includes(b.id) && !needle ? "Recent" : "", b.units === undefined ? "" : `${b.units.toLocaleString()} units`].filter(Boolean).join(" · ") || undefined }))]}
      onSelect={(id) => { setQuery(""); choose(id); }} />;
}
