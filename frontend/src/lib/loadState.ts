// Which of the four states a data area is in. One rule for every screen:
//
// - Data on hand is shown, even while a refresh runs or after a refresh fails: a background problem never blanks a screen.
// - With no data, a failed request is an ERROR, never "empty" and never zero: "No records" and "RWF 0" are statements of
//   fact, and must not be shown when the truth is "we could not find out".
// - A query that is switched off (enabled: false) and has no data is "idle", not loading forever.

export type LoadState = "loading" | "error" | "empty" | "ready" | "idle";

export interface QueryLike<T> {
  data?: T;
  isError?: boolean;
  isFetching?: boolean;
  isPending?: boolean;
}

export function loadState<T>(query: QueryLike<T>, isEmpty: (data: T) => boolean = defaultEmpty): LoadState {
  if (query.data !== undefined && query.data !== null) return isEmpty(query.data) ? "empty" : "ready";
  if (query.isError) return "error";
  if (query.isPending === false) return "empty";  // succeeded, but with nothing in it
  if (query.isFetching === false) return "idle";  // switched off (enabled: false), so not loading
  return "loading";
}

function defaultEmpty(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  const items = (data as { items?: unknown })?.items;
  return Array.isArray(items) ? items.length === 0 : false;
}

/** A background refresh is running while data is already on screen: show it subtly, never as a blocking loader. */
export function isRefreshing<T>(query: QueryLike<T> & { isPlaceholderData?: boolean }): boolean {
  return query.data !== undefined && query.data !== null && !!(query.isFetching || query.isPlaceholderData);
}

/** The first of several queries that is not ready decides the state of a section that needs all of them. */
export function combinedState(states: LoadState[]): LoadState {
  for (const wanted of ["error", "loading", "idle"] as const) if (states.includes(wanted)) return wanted;
  return states.every((s) => s === "empty") && states.length > 0 ? "empty" : "ready";
}

/** For a one-click action on a list row: is the mutation running for THIS row? Matches the id the mutation was called
 *  with, or an `id` field of its variables. Lets the clicked row show progress while the others stay usable. */
export function isPendingFor(mutation: { isPending: boolean; variables?: unknown }, id: string | number): boolean {
  if (!mutation.isPending) return false;
  const v = mutation.variables as { id?: unknown } | string | number | undefined;
  return v === id || (typeof v === "object" && v !== null && v.id === id);
}
