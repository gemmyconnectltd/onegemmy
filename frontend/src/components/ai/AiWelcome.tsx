"use client";

import { AlertTriangle, BarChart3, Factory, FileText, HelpCircle, Package, Users, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import type { AiSuggestion } from "@/lib/api";
import { AiAvatar } from "./AiMessage";

const ICONS: Record<AiSuggestion["icon"], ComponentType<{ size?: number; className?: string }>> = {
  alert: AlertTriangle, package: Package, file: FileText, chart: BarChart3, wallet: Wallet, users: Users, help: HelpCircle, factory: Factory,
};

/** Compact welcome: a short greeting and context-aware starter prompts that go through the normal chat flow. */
export function AiWelcome({
  suggestions, loading, disabledReason, onPick,
}: {
  suggestions: AiSuggestion[] | undefined;
  loading: boolean;
  disabledReason: string | null;
  onPick: (s: AiSuggestion) => void;
}) {
  return (
    <div className="pt-6">
      <div className="flex flex-col items-center text-center">
        <AiAvatar size={36} />
        <h3 className="mt-3 text-[16px] font-semibold text-foreground">How can I help you?</h3>
        <p className="mt-1 text-[13px] text-muted">{disabledReason ?? "Ask anything about your business."}</p>
      </div>
      {!disabledReason && (
        <div className="mt-6 space-y-0.5">
          {loading && [0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-border/40" />)}
          {suggestions?.slice(0, 4).map((s) => {
            const Icon = ICONS[s.icon] ?? HelpCircle;
            return (
              <button key={s.label} type="button" onClick={() => onPick(s)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] text-foreground transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none">
                <Icon size={15} className="flex-shrink-0 text-accent" />
                <span className="leading-tight">{s.label}</span>
              </button>
            );
          })}
          {!loading && suggestions?.length === 0 && (
            <p className="rounded-lg bg-surface px-3.5 py-3 text-center text-[12.5px] text-muted">Nothing to suggest yet for your role or plan.</p>
          )}
        </div>
      )}
    </div>
  );
}
