"use client";

import { useEffect } from "react";

// After a deployment, a tab that stayed open (phones keep tabs alive for days) still runs the previous build and asks for
// code files that no longer exist. Re-rendering cannot fix that; loading the page again fetches the new build.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;
const RELOADED_AT = "pesaa_chunk_reload_at";

function isChunkError(error: Error) {
  return CHUNK_ERROR.test(`${error?.name ?? ""} ${error?.message ?? ""}`);
}

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const chunk = isChunkError(error);

  useEffect(() => {
    if (!chunk) return;
    // Reload once automatically; if the reload itself just happened (within a minute), stop and let the person retry,
    // so a genuinely missing file can never cause a reload loop.
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOADED_AT, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [chunk]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted">
        {chunk ? "A new version of Pesaa is available. Loading it now…" : `Something went wrong: ${error.message}`}
      </p>
      <button onClick={() => (chunk ? window.location.reload() : reset())} className="text-sm font-medium underline">
        {chunk ? "Reload" : "Try again"}
      </button>
    </div>
  );
}
