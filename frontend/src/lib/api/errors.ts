// One shape for every failed request, so screens never have to guess what went wrong.
//
// `request()` has always thrown `{ status, detail }` for HTTP errors and callers read those two fields (e.g. a 409 check).
// That shape is kept and gains `kind`; network failures and timeouts, which used to escape as raw browser errors
// ("TypeError: Failed to fetch", "signal is aborted without reason"), now arrive in the same shape with a readable detail.

export type ApiErrorKind = "http" | "network" | "timeout" | "session";

export interface ApiError {
  status: number;
  detail: string;
  kind: ApiErrorKind;
}

/** Ordinary reads and writes. */
export const REQUEST_TIMEOUT_MS = 60_000;
/** Generated files (PDF, Excel, CSV): large reports legitimately take longer than an ordinary request. */
export const FILE_TIMEOUT_MS = 180_000;
/** The assistant may call the model several times (tool rounds) before it answers; the server allows up to ~3 minutes. */
export const AI_TIMEOUT_MS = 200_000;

export const NETWORK_MESSAGE = "Could not reach the server. Check your internet connection and try again.";
export const TIMEOUT_MESSAGE = "The server took too long to respond. Please try again.";
export const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && typeof (error as ApiError).status === "number" && typeof (error as ApiError).detail === "string";
}

/** Turns anything a request can throw into an ApiError. `timedOut` marks an abort caused by our own timeout. */
export function toApiError(error: unknown, timedOut = false): ApiError {
  if (timedOut) return { status: 0, detail: TIMEOUT_MESSAGE, kind: "timeout" };
  if (isApiError(error)) return { ...error, kind: error.kind ?? (error.status === 401 ? "session" : "http") };
  const name = (error as { name?: string } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") return { status: 0, detail: TIMEOUT_MESSAGE, kind: "timeout" };
  // fetch rejects with a TypeError when the network is down, DNS fails, CORS blocks, or the server is unreachable.
  if (error instanceof TypeError || name === "TypeError") return { status: 0, detail: NETWORK_MESSAGE, kind: "network" };
  return { status: 0, detail: FALLBACK_MESSAGE, kind: "network" };
}

/** A message a person can act on, for any error a screen receives. */
export function apiErrorMessage(error: unknown, fallback = FALLBACK_MESSAGE): string {
  if (error === null || error === undefined) return fallback;
  if (typeof error === "string") return error.trim() || fallback;
  if (isApiError(error)) return error.detail.trim() || fallback;
  const normalised = toApiError(error);
  if (normalised.detail !== FALLBACK_MESSAGE) return normalised.detail;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/** Whether repeating the same READ could succeed: a dropped connection, a timeout, a server error or rate limit.
 *  A 4xx (validation, permission, not found) will fail again, so it is not retried. Writes are never retried. */
export function isRetryableError(error: unknown): boolean {
  const e = toApiError(error);
  if (e.kind === "network" || e.kind === "timeout") return true;
  return e.status >= 500 || e.status === 408 || e.status === 429;
}
