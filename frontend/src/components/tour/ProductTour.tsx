"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { X } from "lucide-react";

export interface TourStep {
  /** CSS selector for the element to spotlight. Omit for a centered step
   *  with no highlight (e.g. a welcome or closing message). */
  target?: string;
  title: string;
  body: string;
}

interface ProductTourProps {
  steps: TourStep[];
  /** localStorage key marking this tour as seen — bump it (e.g. add a `.v2`
   *  suffix) to re-show a redesigned tour to people who already saw the old one. */
  storageKey: string;
}

/** Fire `window.dispatchEvent(new Event(START_TOUR_EVENT))` to (re)start the
 *  tour on demand, e.g. from a "Take a tour" help-menu item, regardless of
 *  whether it's already been marked as seen. */
export const START_TOUR_EVENT = "onegemmy:start-tour";

const PADDING = 8;
const CARD_WIDTH = 320;

export function ProductTour({ steps, storageKey }: ProductTourProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // localStorage unavailable — tour just won't persist as "seen"
    }
    setOpen(false);
  }, [storageKey]);

  // Auto-start once for anyone who hasn't seen this tour yet. No "already
  // started" ref guard here: React Strict Mode's dev-only double-invoke
  // (mount -> cleanup -> mount) would let the first mount's cleanup cancel
  // the pending timeout while a guard blocked the second mount from ever
  // rescheduling it, so the tour would silently never start in dev.
  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(storageKey) === "1";
    } catch {
      alreadySeen = true; // can't persist "seen" reliably — don't force it on every load
    }
    if (alreadySeen) return;
    const id = window.setTimeout(() => {
      setStepIndex(0);
      setOpen(true);
    }, 600);
    return () => window.clearTimeout(id);
  }, [storageKey]);

  // Manual restart, e.g. from a help menu.
  useEffect(() => {
    const onStart = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, []);

  // Skip steps whose target isn't in the DOM (e.g. a nav item hidden by
  // feature flags), and keep the highlight positioned on scroll/resize.
  // Deferred to a timeout so this has no synchronous setState in the effect
  // body (see the hydration-safety convention used throughout appConfig.tsx).
  useEffect(() => {
    if (!open) return;
    let cleanupListeners: (() => void) | undefined;
    const id = window.setTimeout(() => {
      let i = stepIndex;
      while (i < steps.length && steps[i].target && !document.querySelector(steps[i].target!)) {
        i++;
      }
      if (i !== stepIndex) {
        if (i >= steps.length) finish();
        else setStepIndex(i);
        return;
      }
      const step = steps[i];
      const update = () => {
        const el = step.target ? document.querySelector(step.target) : null;
        setRect(el ? el.getBoundingClientRect() : null);
      };
      update();
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      cleanupListeners = () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
      };
    }, 0);
    return () => {
      window.clearTimeout(id);
      cleanupListeners?.();
    };
  }, [open, stepIndex, steps, finish]);

  if (!open) return null;
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const next = () => (isLast ? finish() : setStepIndex((i) => i + 1));
  const prev = () => setStepIndex((i) => Math.max(0, i - 1));

  // Placement: right of a left-edge target (the sidebar, in practice),
  // otherwise below/above depending on available vertical space.
  let cardStyle: CSSProperties;
  if (!rect) {
    cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (rect.left < window.innerWidth / 3) {
    cardStyle = {
      position: "fixed",
      top: Math.min(Math.max(rect.top, 16), window.innerHeight - 300),
      left: rect.right + 16,
    };
  } else if (rect.top < window.innerHeight / 2) {
    cardStyle = {
      position: "fixed",
      top: rect.bottom + 16,
      left: Math.min(Math.max(rect.left, 16), window.innerWidth - CARD_WIDTH - 16),
    };
  } else {
    cardStyle = {
      position: "fixed",
      top: rect.top - 16,
      left: Math.min(Math.max(rect.left, 16), window.innerWidth - CARD_WIDTH - 16),
      transform: "translateY(-100%)",
    };
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {rect ? (
        <div
          className="fixed rounded-xl pointer-events-none transition-all duration-300 ring-2 ring-accent"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(15,12,8,0.6)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60 animate-drawer-fade" />
      )}

      <div
        className="fixed bg-card border border-border shadow-2xl rounded-2xl p-5 animate-drawer-fade"
        style={{ width: CARD_WIDTH, ...cardStyle }}
      >
        <button
          onClick={finish}
          aria-label="Skip tour"
          className="absolute top-3 right-3 text-muted hover:text-foreground transition-colors"
        >
          <X size={15} />
        </button>
        <p className="text-[11px] font-semibold text-accent uppercase tracking-wide mb-1">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="text-[15px] font-bold text-foreground mb-1.5 pr-5">{step.title}</h3>
        <p className="text-[13px] text-muted leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-[12px] font-medium text-muted hover:text-foreground transition-colors">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button onClick={prev} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-foreground bg-surface hover:bg-border transition-colors">
                Back
              </button>
            )}
            <button onClick={next} className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-accent hover:bg-accent/90 transition-colors">
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
