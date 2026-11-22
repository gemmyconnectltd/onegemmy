import { Loader2, type LucideIcon } from "lucide-react";

/** The icon of a compact icon-only action, swapped for the shared spinner while that action runs. Pair it with
 *  `disabled={busy}` and `aria-busy={busy}` on the button so a second click is refused and the state is announced. */
export function BusyIcon({ busy, icon: Icon, size = 14 }: { busy: boolean; icon: LucideIcon; size?: number }) {
  return busy ? <Loader2 size={size} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Icon size={size} aria-hidden />;
}
