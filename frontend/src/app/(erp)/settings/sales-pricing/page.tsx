"use client";

import Link from "next/link";
import { useState } from "react";
import { Tags } from "lucide-react";
import { SettingRow, SettingsCard } from "@/components/settings/parts";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useBranchPricingStatus, useSwitchBranchPricing } from "@/lib/api/hooks";

/** Business Settings → Sales & pricing. The owner switches branch prices on or off here (when Pesaa allows it). Switching
 *  off keeps every saved branch price and hidden product; they apply again when it is switched back on. */
export default function SalesPricingSettingsPage() {
  const status = useBranchPricingStatus();
  const change = useSwitchBranchPricing();
  const { confirm, dialog } = useConfirmDialog();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (status.isLoading) return <PageLoader variant="compact" />;
  const s = status.data;
  if (!s) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">Sales & pricing settings could not be loaded. Refresh the page to try again.</p>;

  const toggle = (next: boolean) => confirm({
    title: next ? "Switch branch prices on?" : "Switch branch prices off?",
    message: next
      ? "Each branch can then sell a product at its own price, or not sell it at all. Inventory gets a Branch prices tab, and the till uses each branch's price."
      : "Every branch sells every product at its default price again. Saved branch prices and hidden products are kept and come back when you switch this on again.",
    confirmLabel: next ? "Switch on" : "Switch off",
    danger: !next,
    onConfirm: async () => {
      setMessage(null);
      try {
        await change.mutateAsync(next);
        setMessage({ kind: "ok", text: next ? "Branch prices are on. Set them in Inventory → Branch prices." : "Branch prices are off. Saved values are kept." });
      } catch (e) {
        setMessage({ kind: "error", text: (e as { detail?: string })?.detail ?? "Branch prices could not be changed. Try again." });
      }
    },
  });

  return (
    <div className="space-y-4">
      {dialog}
      <SettingsCard icon={Tags} title="Branch prices" description="Sell a product at a different price in each branch, or hide it in branches that don't sell it.">
        <SettingRow label="Branch prices" hint={s.self_service ? "Only the business owner can switch this. Managers with the “Manage branch prices” permission set the prices." : "Pesaa manages this setting for your business. Contact Pesaa support to change it."}>
          {s.can_toggle
            ? <Toggle checked={s.enabled} onChange={toggle} loading={change.isPending} label={s.enabled ? "Switch branch prices off" : "Switch branch prices on"} />
            : <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">{s.enabled ? "On" : "Off"}</span>}
        </SettingRow>
        {s.enabled && s.can_manage && <SettingRow label="Set prices and hide products" hint="Per branch, for every product.">
          <Link href="/inventory/branch-prices" className="text-sm font-semibold text-accent hover:underline">Open Branch prices →</Link>
        </SettingRow>}
      </SettingsCard>
      {message && <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-muted"}>{message.text}</p>}
    </div>
  );
}
