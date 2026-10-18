// The ONE place Support data comes from. Today it reads and writes sample data in this browser (localStorage, demo
// only); a later phase replaces these functions with calls to the Pesaa backend and nothing in the screens changes.
import { buildDemoState } from "./mockData";
import type { SupportState } from "./types";

const KEY = "pesaa_admin_support_demo_v1";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Object URLs from files picked in this session can't survive a reload, so they are never saved. */
function forStorage(state: SupportState): SupportState {
  const strip = <T extends { attachments: { previewUrl?: string }[] }>(m: T): T => ({ ...m, attachments: m.attachments.map((a) => ({ ...a, previewUrl: undefined })) });
  return { ...state, conversations: state.conversations.map((c) => ({ ...c, messages: c.messages.map(strip) })) };
}

export const supportService = {
  async load(): Promise<SupportState> {
    await wait(280);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SupportState;
        if (Array.isArray(parsed.conversations) && Array.isArray(parsed.agents)) return parsed;
      }
    } catch { /* corrupted or blocked storage: start from the sample data */ }
    return buildDemoState();
  },
  save(state: SupportState): void {
    try { localStorage.setItem(KEY, JSON.stringify(forStorage(state))); } catch { /* storage full or blocked: demo just won't persist */ }
  },
  async reset(): Promise<SupportState> {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    await wait(200);
    return buildDemoState();
  },
};
