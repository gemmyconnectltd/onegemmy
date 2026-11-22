import { QueryClient } from "@tanstack/react-query";
import { branchSwitchAction } from "./branchScope";
import { isRetryableError } from "./errors";

// Shared singleton used by both the provider and non-hook callers (e.g. logout).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 20s, mirroring the old in-memory GET cache TTL,
      // then refetches in the background on remount so UIs feel instant.
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // One more try only when it could succeed (dropped connection, timeout, server error). A validation, permission or
      // not-found error would fail again, so the screen shows it at once instead of after a second wait.
      retry: (failures, error) => failures < 1 && isRetryableError(error),
    },
    mutations: {
      // Writes are never repeated automatically: a create, payment or approval that timed out may already have happened.
      retry: false,
    },
  },
});

// Drop every cached query (used on logout / tenant switch).
export function clearApiQueryCache() {
  queryClient.clear();
}

/** After a branch switch: reset branch-scoped data (no previous-branch data is ever shown), refresh entitlements in the
 *  background, keep the person's profile. See branchScope.ts for the rule. */
export function resetBranchScopedQueries() {
  void queryClient.invalidateQueries({ predicate: (query) => branchSwitchAction(query.queryKey) === "refresh" });
  void queryClient.resetQueries({ predicate: (query) => branchSwitchAction(query.queryKey) === "reset" });
}
