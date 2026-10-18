"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, getStoredToken } from "@/lib/api";
import { SUPPORT_KEY } from "./hooks";

export interface SupportEvent { type: string; conversation_id?: string; ticket_id?: string; reference?: string; priority?: string; channel?: string; status?: string }

/**
 * Subscribes to /support/stream (Server-Sent Events) for as long as the Support area is open. EventSource can't send
 * an Authorization header, so this reads the stream with fetch. Events only say WHAT changed; the matching queries
 * are invalidated and refetched through the normal authorized API. Reconnects with a short delay, and stops on 401/403.
 */
export function useSupportStream(onEvent?: (e: SupportEvent) => void) {
  const qc = useQueryClient();
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; });

  useEffect(() => {
    let stopped = false;
    const ctrl = new AbortController();

    const run = async () => {
      while (!stopped) {
        try {
          const res = await fetch(`${API_BASE}/support/stream`, { headers: { Authorization: `Bearer ${getStoredToken() ?? ""}`, Accept: "text/event-stream" }, signal: ctrl.signal });
          if (res.status === 401 || res.status === 403) return;
          if (!res.ok || !res.body) throw new Error("stream");
          // After (re)connecting, anything could have changed while we were away.
          qc.invalidateQueries({ queryKey: SUPPORT_KEY });
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let i: number;
            while ((i = buf.indexOf("\n\n")) >= 0) {
              const frame = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const line = frame.split("\n").find((l) => l.startsWith("data: "));
              if (!line) continue;
              try {
                const ev = JSON.parse(line.slice(6)) as SupportEvent;
                qc.invalidateQueries({ queryKey: SUPPORT_KEY });
                handler.current?.(ev);
              } catch { /* ignore a malformed frame */ }
            }
          }
        } catch {
          if (stopped) return;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    };
    void run();
    return () => { stopped = true; ctrl.abort(); };
  }, [qc]);
}
