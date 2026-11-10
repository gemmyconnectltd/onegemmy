"use client";

import { useState } from "react";
import { BadgeCheck, Calculator, Gift, Percent, Sparkles, Ticket, TrendingDown, ShoppingBasket, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import type { AdminTenant } from "@/lib/api/admin";
import { Card } from "@/app/(portal)/tenants/[id]/TenantPanels";

const DEFAULT_DISCOUNT_FLAGS = {
  enabled: true,
  manualPos: true,
  automatic: true,
  campaigns: true,
  coupons: true,
  approvals: false,
  advanced: true,
} as const;

type DiscountFlagKey = keyof typeof DEFAULT_DISCOUNT_FLAGS;

const FLAG_LABELS: Record<DiscountFlagKey, string> = {
  enabled: "Enable Discount Management",
  manualPos: "Enable Manual POS Discounts",
  automatic: "Enable Automatic Discounts",
  campaigns: "Enable Promotion Campaigns",
  coupons: "Enable Coupon Codes",
  approvals: "Enable Discount Approvals",
  advanced: "Enable Advanced Discount Types",
};

const TYPE_DEFS = [
  { title: "Percentage Discount", description: "10% off with caps, eligibility, date windows and approval thresholds.", icon: Percent },
  { title: "Fixed Amount Discount", description: "Currency-based reductions that never push the final price below zero.", icon: WalletCards },
  { title: "Product-Specific Discount", description: "Restriction to a single product, variant or exclusion set.", icon: ShoppingBasket },
  { title: "Category Discount", description: "Apply a discount to a category or product family, with scope validation.", icon: BadgeCheck },
  { title: "Customer / VIP Discount", description: "Use existing customer records and eligibility conditions without inventing new data.", icon: Sparkles },
  { title: "Volume / Quantity Discount", description: "Threshold-based reductions for qualifying bundle sizes or combined quantities.", icon: Calculator },
  { title: "Buy X Get Y", description: "Reward logic for free or discounted items, inventory-safe redemptions.", icon: Gift },
  { title: "Coupon / Promo Code", description: "Unique promotional codes with expiry, redemption caps and customer limits.", icon: Ticket },
  { title: "Order-Level Discount", description: "Percent or fixed reductions applied to the entire eligible cart.", icon: TrendingDown },
  { title: "Tiered Discount", description: "Configurable tiers that apply the highest valid quantity or spend band.", icon: Percent },
] as const;

export function DiscountsPanel({ tenant }: { tenant: AdminTenant }) {
  const [config, setConfig] = useState(DEFAULT_DISCOUNT_FLAGS);

  const toggle = (key: DiscountFlagKey) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      <Card title="Discount & Promotion Management" action={<Button variant="outline" size="sm">Review rules</Button>}>
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface/60 p-3 text-[12.5px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{tenant.name} can keep discount controls optional for every business. When disabled, the POS hides discount actions, automatic discounts stop, and protected backend operations are removed from the active rule set.</p>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground">
            <span className={config.enabled ? "inline-block h-2 w-2 rounded-full bg-emerald-500" : "inline-block h-2 w-2 rounded-full bg-muted"} aria-hidden />
            {config.enabled ? "Enabled" : "Disabled"}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(DEFAULT_DISCOUNT_FLAGS) as DiscountFlagKey[]).map((key) => (
            <div key={key} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground">{FLAG_LABELS[key]}</p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {key === "enabled" && "Master switch for the sales discount engine."}
                    {key === "manualPos" && "Controls manual line and cart discounts in POS."}
                    {key === "automatic" && "Applies automatic eligibility rules without operator intervention."}
                    {key === "campaigns" && "Allows campaign-based promotional windows and bundles."}
                    {key === "coupons" && "Supports unique promo codes and redemption history."}
                    {key === "approvals" && "Requires approval for high-value or risky discount actions."}
                    {key === "advanced" && "Unlocks advanced discount types and complex rule combinations."}
                  </p>
                </div>
                <Toggle checked={config[key]} onChange={() => toggle(key)} size="sm" label={FLAG_LABELS[key]} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Supported discount types" action={<span className="text-[11.5px] font-semibold text-muted">10 business-facing rule types</span>}>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {TYPE_DEFS.map(({ title, description, icon: Icon }, index) => (
            <div key={title} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={15} aria-hidden /></span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Type {index + 1}</span>
              </div>
              <p className="mt-3 text-[13px] font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Sales settings at a glance" className="bg-surface/50">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Configuration</p>
            <p className="mt-2 text-[15px] font-extrabold text-foreground">{Object.values(config).filter(Boolean).length}/{Object.keys(config).length} enabled</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Eligibility</p>
            <p className="mt-2 text-[15px] font-extrabold text-foreground">Products, customers, inventory and spend</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Approval</p>
            <p className="mt-2 text-[15px] font-extrabold text-foreground">{config.approvals ? "Required for risky discounts" : "Operator-driven by default"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
