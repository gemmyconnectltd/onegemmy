// What happens to a cached query when the person switches the branch they are working in.
//
// Almost every list and report is scoped to the active branch on the server (the X-Branch-Id header), so those are
// reset: their data is dropped and they show a loading state until the new branch's data arrives. Nothing from the
// previous branch can be shown, not even as "previous data" while refetching.
//
// Who the person is does not depend on the branch, so their profile is kept, and the shell and sidebar stay as they are.
// Entitlements carry per-branch controls (a beta or rollout may cover only some branches), so they are refreshed in the
// background rather than dropped: the sidebar keeps its links while the new branch's controls load.

export type BranchSwitchAction = "keep" | "refresh" | "reset";

const KEEP: readonly (readonly string[])[] = [
  ["users", "me"],             // the signed-in person's own record and current access
  ["tenants", "me", "current"], // the business itself (name, currency, branding)
];
const REFRESH: readonly (readonly string[])[] = [
  ["tenants", "me", "entitlements"],
  ["tenants", "me", "modules"],
];

const same = (key: readonly unknown[], target: readonly string[]) =>
  key.length === target.length && target.every((part, i) => key[i] === part);

export function branchSwitchAction(queryKey: readonly unknown[]): BranchSwitchAction {
  if (KEEP.some((target) => same(queryKey, target))) return "keep";
  if (REFRESH.some((target) => same(queryKey, target))) return "refresh";
  return "reset";
}
