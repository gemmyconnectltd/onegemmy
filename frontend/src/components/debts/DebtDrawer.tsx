"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { Drawer } from "@/components/ui/Drawer";

/** Use the shared drawer surface while keeping keyboard focus inside this debt workflow. */
export function DebtDrawer(props: ComponentProps<typeof Drawer>) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement as HTMLElement | null;
    let dialog: HTMLElement | null = null;
    const frame = requestAnimationFrame(() => {
      dialog = content.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
      if (!dialog) return;
      dialog.classList.add("debt-dialog");
      dialog.setAttribute("aria-label", dialog.querySelector("h2")?.textContent || "Debt details");
      if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>('button, input, select, textarea, a[href]')?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]')).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus(); };
  }, [props.open]);
  useEffect(() => { content.current?.closest<HTMLElement>('[role="dialog"]')?.setAttribute("aria-label", props.title || "Debt details"); }, [props.open, props.title]);
  return <Drawer {...props}><div ref={content}>{props.children}</div></Drawer>;
}
