"use client";

import { usePathname } from "next/navigation";
import { Info, Lock, TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFeatureControls } from "@/lib/api/hooks";
import type { FeatureControlState } from "@/lib/api/tenants";

/** Mobile screen -> the modules and parts it uses (backend keys). */
const SCREENS: [string, string[]][] = [
  ["/pos", ["sales", "pos"]], ["/cart", ["sales", "pos"]], ["/payment", ["sales", "pos"]], ["/held", ["sales", "pos"]], ["/receipt", ["sales", "pos"]],
  ["/sales", ["sales"]], ["/customers", ["sales"]], ["/transactions", ["sales"]],
  ["/inventory", ["inventory"]], ["/products", ["inventory"]], ["/restock", ["inventory"]],
  ["/purchase", ["procurement"]], ["/suppliers", ["procurement"]],
  ["/expenses", ["accounting", "expenses"]],
];

const NAMES: Record<string, string> = { sales: "Sales", pos: "Point of Sale", inventory: "Inventory", procurement: "Purchases", accounting: "Accounting", expenses: "Expenses" };

function pick(controls: Record<string, FeatureControlState>, keys: string[]) {
  const found = keys.map((k) => [k, controls[k]] as const).filter((x): x is readonly [string, FeatureControlState] => !!x[1]);
  const off = found.find(([, c]) => !c.writable);
  if (off) return { tone: "lock" as const, text: off[1].message ?? `${NAMES[off[0]] ?? off[0]} is not taking changes right now. You can still look things up.` };
  const warn = found.find(([, c]) => c.level === "warning" && c.message);
  if (warn) return { tone: "warn" as const, text: warn[1].message! };
  const soon = found.find(([, c]) => c.upcoming);
  if (soon) {
    const when = new Date(soon[1].upcoming!.at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return { tone: "warn" as const, text: `Heads up: ${NAMES[soon[0]] ?? soon[0]} changes on ${when}.${soon[1].upcoming!.message ? ` ${soon[1].upcoming!.message}` : ""}` };
  }
  const info = found.find(([, c]) => c.level === "info" && c.message);
  if (info) return { tone: "info" as const, text: info[1].message! };
  const limited = found.find(([, c]) => c.blocked_actions.length);
  if (limited) return { tone: "info" as const, text: `Some actions in ${NAMES[limited[0]] ?? limited[0]} are limited by Pesaa.` };
  return null;
}

/** Pesaa's message for the screen you are on: read-only, maintenance, beta, retirement or a change coming soon.
 *  Shows nothing offline or when everything is normal; the server applies the same rules either way. */
export default function FeatureNotice() {
  const pathname = usePathname();
  const { user } = useAuth();
  const keys = SCREENS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"))?.[1];
  const { data } = useFeatureControls({ enabled: !!user && !!keys });
  const notice = keys && data ? pick(data, keys) : null;
  if (!notice) return null;
  const Icon = notice.tone === "lock" ? Lock : notice.tone === "warn" ? TriangleAlert : Info;
  return <div role="status" className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-foreground">
    <Icon size={15} aria-hidden className={"mt-0.5 flex-shrink-0 " + (notice.tone === "info" ? "text-accent" : "text-[var(--warning)]")} />
    <p>{notice.tone === "lock" && <strong className="font-semibold">Read-only. </strong>}{notice.text}</p>
  </div>;
}
