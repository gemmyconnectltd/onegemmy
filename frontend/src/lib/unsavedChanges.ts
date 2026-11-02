/** Form state stays in memory and never includes tokens or persisted credentials. */
export function hasUnsavedChanges(root: ParentNode = document): boolean {
  return root.querySelector('[data-workspace-dirty="true"]') !== null;
}
export function confirmWorkspaceChange(): boolean {
  return !hasUnsavedChanges() || window.confirm("Switch workspace and discard unsaved changes?");
}

export function controlSnapshot(root: ParentNode): string {
  return JSON.stringify([...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")].map((el) => el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value));
}
