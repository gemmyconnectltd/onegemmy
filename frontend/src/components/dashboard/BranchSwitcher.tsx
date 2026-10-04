"use client";

import { useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMyBranches } from "@/lib/api/hooks";

/**
 * Lets a user with no fixed branch (an Admin/Owner) pick which branch
 * they're currently acting in — drives the X-Branch-Id header on every
 * request from then on. A user who does have a fixed branch never sees
 * this: there's nothing for them to switch between, and the backend
 * ignores the header for them anyway.
 */
export function BranchSwitcher() {
  const { user, activeBranchId, setActiveBranchId } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: branches } = useMyBranches({ enabled: !user?.branchId });

  if (!user || user.branchId) return null;

  const items = branches?.items ?? [];
  if (items.length < 2) return null;

  const current = items.find((b) => b.id === activeBranchId);
  const label = current?.name ?? "All Branches";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-surface text-foreground border border-border hover:border-foreground/20 transition-colors flex-shrink-0 min-w-0"
        title="Switch active branch"
      >
        <Building2 size={14} className="text-accent flex-shrink-0" />
        <span className="text-[13px] font-semibold truncate max-w-[120px]">{label}</span>
        <ChevronDown size={12} className="text-muted flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-card border border-border shadow-lg z-50 min-w-[200px] py-1">
            <button
              onClick={() => { setActiveBranchId(null); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 text-left px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                !activeBranchId ? "bg-accent/10 text-accent" : "hover:bg-surface text-foreground"
              }`}
            >
              All Branches
              {!activeBranchId && <Check size={13} />}
            </button>
            <div className="h-px bg-border my-1" />
            {items.map((b) => (
              <button
                key={b.id}
                onClick={() => { setActiveBranchId(b.id); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 text-left px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                  activeBranchId === b.id ? "bg-accent/10 text-accent" : "hover:bg-surface text-foreground"
                }`}
              >
                <span className="truncate">{b.name}{b.is_main ? " (Main)" : ""}</span>
                {activeBranchId === b.id && <Check size={13} className="flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
