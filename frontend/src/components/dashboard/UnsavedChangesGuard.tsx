"use client";
import { useEffect } from "react";
import { queryClient } from "@/lib/api/queryClient";
import { hasUnsavedChanges } from "@/lib/unsavedChanges";

function snapshot(form: HTMLFormElement) {
  return JSON.stringify([...form.elements].map((element) => {
    if (element instanceof HTMLInputElement) return [element.name, element.type === "checkbox" || element.type === "radio" ? element.checked : element.value];
    if (element instanceof HTMLSelectElement) return [element.name, [...element.selectedOptions].map((o) => o.value)];
    if (element instanceof HTMLTextAreaElement) return [element.name, element.value];
    return null;
  }));
}
/** Protect real editing forms; filter bars outside forms do not become dirty. A successful persistent form can dispatch reset. */
export function UnsavedChangesGuard() {
  useEffect(() => {
    const initial = new WeakMap<HTMLFormElement, string>();
    let submitting: HTMLFormElement | null = null;
    const submitted = new WeakMap<object, HTMLFormElement>();
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "added" && submitting) submitted.set(event.mutation, submitting);
      if (event.type !== "updated" || event.action.type !== "success") return;
      const form = submitted.get(event.mutation);
      if (form?.isConnected) {
        initial.set(form, snapshot(form)); delete form.dataset.workspaceDirty;
        form.dispatchEvent(new CustomEvent("pesaa:form-saved", { bubbles: true }));
      }
    });
    const formOf = (e: Event) => e.target instanceof HTMLElement ? e.target.closest("form:not([data-workspace-ignore])") as HTMLFormElement | null : null;
    const focus = (e: Event) => { const form = formOf(e); if (form && !initial.has(form)) initial.set(form, snapshot(form)); };
    const change = (e: Event) => { const form = formOf(e); if (form) form.dataset.workspaceDirty = String(initial.get(form) !== snapshot(form)); };
    const reset = (e: Event) => { const form = formOf(e); if (form) { initial.delete(form); delete form.dataset.workspaceDirty; } };
    const submit = (e: Event) => { submitting = formOf(e); queueMicrotask(() => { submitting = null; }); };
    document.addEventListener("submit", submit, true);
    const navigate = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
      const link = e.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href, location.href);
      if (next.origin !== location.origin || (next.pathname === location.pathname && next.search === location.search) || !hasUnsavedChanges()) return;
      if (!window.confirm("Leave this page and discard unsaved changes?")) { e.preventDefault(); e.stopPropagation(); }
      else document.querySelectorAll<HTMLElement>('[data-workspace-dirty="true"]').forEach((node) => { delete node.dataset.workspaceDirty; });
    };
    document.addEventListener("click", navigate, true);
    const unload = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("focusin", focus); document.addEventListener("input", change); document.addEventListener("change", change); document.addEventListener("reset", reset);
    window.addEventListener("beforeunload", unload);
    return () => { unsubscribe(); document.removeEventListener("submit", submit, true); document.removeEventListener("click", navigate, true); document.removeEventListener("focusin", focus); document.removeEventListener("input", change); document.removeEventListener("change", change); document.removeEventListener("reset", reset); window.removeEventListener("beforeunload", unload); };
  }, []);
  return null;
}
