"use client";

import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useEffectEvent, useId, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { controlSnapshot, hasUnsavedChanges } from "@/lib/unsavedChanges";
import { X } from "lucide-react";

export type DrawerSide = "left" | "right" | "center" | "bottom";
export type DrawerSize = "sm" | "md" | "lg" | "xl" | "document";
interface DrawerProps {
  open: boolean; onClose: () => void; title?: string; description?: string;
  side?: DrawerSide; size?: DrawerSize; children?: ReactNode; footer?: ReactNode;
  /** Ask before dismissing a form with unsaved input. */
  dirty?: boolean;
  trackChanges?: boolean;
}
const DrawerDepth = createContext(0);
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const overlayStack: string[] = [];
let originalOverflow = "";
const SIDE_WIDTHS: Record<DrawerSize, string> = {
  sm: "sm:w-80", md: "sm:w-96", lg: "sm:w-[420px]", xl: "sm:w-[480px]", document: "sm:w-[480px]",
};
const CENTER_WIDTHS: Record<DrawerSize, string> = {
  sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", document: "max-w-3xl",
};
const controls = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** One overlay contract: full-height form drawers, compact selection sheets, and document dialogs. */
export function Drawer({ open, onClose, title, description, side = "right", size = "md", children, footer, dirty = false, trackChanges = side !== "bottom" }: DrawerProps) {
  const depth = useContext(DrawerDepth);
  const isClient = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const baseline = useRef<string | null>(null);
  const dismiss = () => { if (!(dirty || (panel.current && (panel.current.dataset.workspaceDirty === "true" || hasUnsavedChanges(panel.current)))) || window.confirm("Discard unsaved changes?")) onClose(); };
  const closeFromEffect = useEffectEvent(dismiss);
  useEffect(() => {
    if (!open || !isClient) return;
    baseline.current = null;
    const previous = document.activeElement as HTMLElement | null;
    if (!overlayStack.length) { originalOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    overlayStack.push(id);
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      (target ?? panel.current)?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (overlayStack.at(-1) !== id) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFromEffect(); }
      if (e.key !== "Tab") return;
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(controls) ?? [])].filter((el) => el.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!first) { e.preventDefault(); panel.current?.focus(); }
      else if (!panel.current?.contains(document.activeElement) || document.activeElement === panel.current) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const fit = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (panel.current) panel.current.style.maxHeight = `${Math.max(160, height - (side === "center" ? 32 : 0))}px`;
      if (panel.current?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.scrollIntoView?.({ block: "nearest" });
    };
    fit(); window.visualViewport?.addEventListener("resize", fit);
    const node = panel.current;
    const saved = () => { if (node) { baseline.current = controlSnapshot(node); delete node.dataset.workspaceDirty; } };
    node?.addEventListener("pesaa:form-saved", saved);
    document.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("pesaa:form-saved", saved);
      window.visualViewport?.removeEventListener("resize", fit);
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const index = overlayStack.indexOf(id); if (index >= 0) overlayStack.splice(index, 1);
      if (!overlayStack.length) document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, isClient, id, side]);
  if (!open || !isClient) return null;
  const centered = side === "center";
  const sheet = side === "bottom";
  const placement = centered
    ? `relative w-full ${CENTER_WIDTHS[size]} max-h-[calc(100dvh-2rem)] animate-drawer-center`
    : sheet
      ? "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2"
      : `fixed inset-y-0 ${side === "left" ? "w-[86vw] max-w-xs" : "w-full"} ${SIDE_WIDTHS[size]} ${side === "left" ? "left-0 animate-drawer-left" : "right-0 animate-drawer-right"}`;
  return <DrawerDepth.Provider value={depth + 1}>{createPortal(
    <div style={{ zIndex: 100 + depth * 20 }} className={`fixed inset-0 ${centered ? "flex items-center justify-center p-4" : ""}`} data-overlay-root>
      <div className="absolute inset-0 bg-black/40 animate-drawer-fade" onClick={dismiss} aria-hidden="true" />
      <div ref={panel} onFocusCapture={(e) => { if (trackChanges && baseline.current === null && e.target.matches("input, select, textarea")) baseline.current = controlSnapshot(e.currentTarget); }} onChangeCapture={(e) => { if (trackChanges && baseline.current !== null) e.currentTarget.dataset.workspaceDirty = String(controlSnapshot(e.currentTarget) !== baseline.current); }} role="dialog" aria-modal="true" aria-labelledby={title ? `${id}-title` : undefined} aria-label={title ? undefined : "Dialog"} aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1}
        className={`${placement} pesaa-dialog flex min-h-0 min-w-0 flex-col border border-border bg-card shadow-2xl outline-none`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">{title && <h2 id={`${id}-title`} className="pesaa-card-title break-words">{title}</h2>}{description && <p id={`${id}-description`} className="mt-1 text-sm text-muted">{description}</p>}</div>
          <button type="button" onClick={dismiss} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="pesaa-dialog-footer shrink-0 border-t border-border px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>, document.body
  )}</DrawerDepth.Provider>;
}
