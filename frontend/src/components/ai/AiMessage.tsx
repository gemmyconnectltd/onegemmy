"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import type { AiAction, AiBlock } from "@/lib/api";
import { fmtRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import { AiActionCard } from "./AiActionCard";
import { Block, Inline } from "./AiBlocks";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: Date;
  blocks?: AiBlock[];
  links?: { label: string; href: string }[];
  actions?: AiAction[];
  followups?: { label: string; ask: string }[];
  degraded?: boolean;
  /** A failed request, kept in the thread so it can be retried. */
  error?: string;
  retryText?: string;
}

export function AiAvatar({ size = 28 }: { size?: number }) {
  return (
    <span className="flex flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent" style={{ width: size, height: size }} aria-hidden>
      <Sparkles size={Math.round(size * 0.52)} />
    </span>
  );
}

export function UserMessage({ turn }: { turn: Turn }) {
  return (
    <div className="ml-auto w-fit max-w-[82%]">
      <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent/10 px-3.5 py-2 text-[13.5px] leading-relaxed text-foreground">{turn.text}</div>
    </div>
  );
}

/** Skeleton shown while a request is processed — no fake typing animation delaying a finished answer. */
export function Thinking() {
  return (
    <div className="flex items-start gap-2" role="status" aria-live="polite">
      <AiAvatar size={24} />
      <div className="w-full max-w-[80%] space-y-2 pt-1.5">
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-border/70 motion-reduce:animate-none" />
        <div className="h-2.5 w-3/5 animate-pulse rounded bg-border/70 motion-reduce:animate-none" />
        <span className="sr-only">Looking at your data…</span>
      </div>
    </div>
  );
}

export function AssistantMessage({
  turn, onRetry, onAsk, onNavigate, showFollowups = true,
}: {
  turn: Turn;
  /** Quick follow-up chips only make sense under the latest answer. */
  showFollowups?: boolean;
  onRetry: (text: string) => void;
  onAsk: (question: string) => void;
  onNavigate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (turn.error) {
    return (
      <div className="flex items-start gap-2">
        <AiAvatar size={24} />
        <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-400" role="alert">
          {turn.error}
          {turn.retryText && (
            <button type="button" onClick={() => onRetry(turn.retryText!)} className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold underline">
              <RotateCcw size={11} /> Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.text.replace(/[  ]/g, " "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable (insecure context): silently skip */ }
  };

  return (
    <div className="group flex items-start gap-2.5">
      <AiAvatar size={24} />
      <div className="min-w-0 max-w-[94%] flex-1">
        <div className="pt-0.5 text-[13.5px] leading-relaxed text-foreground">
          <p className="whitespace-pre-line"><Inline text={turn.text} /></p>
          {turn.blocks?.map((b, i) => <Block key={i} block={b} />)}
          {turn.actions?.map((a) => <AiActionCard key={a.id} action={a} onNavigate={onNavigate} />)}
          {turn.links && turn.links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {turn.links.map((l) => /^https?:\/\//.test(l.href) ? (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                  className="text-[12px] font-semibold text-green-700 hover:underline dark:text-green-400">{l.label} ↗</a>
              ) : (
                <Link key={l.href} href={l.href} onClick={onNavigate}
                  className="text-[12px] font-semibold text-accent hover:underline">{l.label} →</Link>
              ))}
            </div>
          )}
          {turn.degraded && <p className="mt-2 text-[11px] text-muted">I couldn&apos;t write a full summary just now, so here are the figures.</p>}
        </div>
        {showFollowups && turn.followups && turn.followups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.followups.map((f) => (
              <button key={f.ask} type="button" onClick={() => onAsk(f.ask)}
                className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground/80 transition-colors hover:border-accent/40 hover:text-accent">{f.label}</button>
            ))}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted/70">
          <time dateTime={turn.at.toISOString()}>{fmtRelative(turn.at)}</time>
          <button type="button" onClick={copy} aria-label="Copy response"
            className={cn("flex items-center gap-1 rounded px-1 py-0.5 transition-opacity hover:text-foreground", copied ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100")}>
            {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}
