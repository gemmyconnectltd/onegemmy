import { QueryClient } from "@tanstack/react-query";

// Shared singleton used by both the provider and non-hook callers (e.g. logout).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 20s, mirroring the old in-memory GET cache TTL,
      // then refetches in the background on remount so UIs feel instant.
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Drop every cached query (used on logout / tenant switch).
export function clearApiQueryCache() {
  queryClient.clear();
}
