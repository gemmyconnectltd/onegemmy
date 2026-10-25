"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, Check, Globe } from "lucide-react";
import { appUrl } from "@/lib/site";
import { annualSaving, formatPrice, hasAnnual, planFeatures, regionLabel, type PublicPricing } from "@/lib/pricing";
import { cn } from "@/lib/cn";

type Billing = "monthly" | "annual";

interface Option<T extends string> { id: T; label: string; icon?: ReactNode; badge?: string }

/** Segmented control with a sliding indicator; the global focus-visible outline handles keyboard focus. */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label: string }) {
  const index = options.findIndex((o) => o.id === value);
  return (
    <div role="group" aria-label={label} className="relative inline-grid auto-cols-fr grid-flow-col rounded-xl border border-border bg-surface p-1">
      <span aria-hidden className="absolute inset-y-1 left-1 rounded-lg bg-[var(--primary)] shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }} />
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button key={o.id} type="button" aria-pressed={active} onClick={() => onChange(o.id)}
            className={cn("relative z-10 inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:px-5", active ? "text-white" : "text-muted hover:text-foreground")}>
            {o.icon}{o.label}
            {o.badge && <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none transition-colors", active ? "bg-white/20 text-white" : "bg-[var(--primary-light)] text-accent")}>{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

const flagFor = (currency: string) => (currency === "RWF" ? <Image src="/flags/rw.svg" alt="" width={20} height={20} unoptimized className="h-5 w-5 rounded-full object-cover" /> : currency === "USD" ? <Globe size={18} aria-hidden /> : null);

/** Plans and prices exactly as configured in the billing backend; the visitor picks a currency and billing period. */
export function PricingPlans({ pricing }: { pricing: PublicPricing }) {
  const [currency, setCurrency] = useState(pricing.currencies.includes("RWF") ? "RWF" : pricing.currencies[0]);
  const [billing, setBilling] = useState<Billing>("monthly");
  const canAnnual = hasAnnual(pricing, currency);
  const annual = billing === "annual" && canAnnual;
  const bestSaving = Math.max(0, ...pricing.plans.map((p) => (p.prices[currency] ? annualSaving(p.prices[currency]) : 0)));
  const tax = Math.max(0, ...pricing.plans.map((p) => p.prices[currency]?.taxBps ?? 0));

  return (
    <div>
      <div className="mb-10 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          {pricing.currencies.length > 1 && (
            <Segmented label="Currency" value={currency} onChange={(c) => { setCurrency(c); if (!hasAnnual(pricing, c)) setBilling("monthly"); }}
              options={pricing.currencies.map((c) => ({ id: c, label: regionLabel(c), icon: flagFor(c) }))} />
          )}
          {canAnnual && <Segmented label="Billing period" value={billing} onChange={setBilling} options={[{ id: "monthly", label: "Monthly" }, { id: "annual", label: "Annual", badge: bestSaving ? `-${bestSaving}%` : undefined }]} />}
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          Prices in <span className="font-semibold text-foreground">{currency}</span> · billed {annual ? `yearly${bestSaving ? `, saving up to ${bestSaving}%` : ""}` : "monthly"}{tax ? ` · plus ${tax / 100}% tax` : ""}
        </p>
      </div>

      <div className={cn("grid gap-5 sm:grid-cols-2", pricing.plans.length >= 3 ? "lg:grid-cols-3" : "", pricing.plans.length >= 4 ? "xl:grid-cols-4" : "")}>
        {pricing.plans.map((plan) => {
          const price = plan.prices[currency];
          const features = planFeatures(plan, currency);
          const perMonth = price ? (annual ? Math.round(price.annual / 12) : price.monthly) : 0;
          return (
            <div key={plan.id} className="landing-card relative flex flex-col border-border p-5">
              <h3 className="text-center text-base font-semibold text-foreground">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-center text-xs text-muted">{plan.description}</p>}
              <div className="mt-3 min-h-[84px] text-center">
                {!price ? (
                  <><p className="text-lg font-bold text-foreground">Not offered in {currency}</p><p className="mt-1 text-xs text-muted">Contact us for pricing</p></>
                ) : price.monthly === 0 && price.annual === 0 ? (
                  <p className="text-2xl font-extrabold text-accent">Free</p>
                ) : (
                  <>
                    <p className="whitespace-nowrap text-2xl font-extrabold leading-tight text-accent">{formatPrice(perMonth, currency)}</p>
                    <p className="text-xs font-medium text-muted">per month</p>
                    {annual && <p className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground/70">{formatPrice(price.annual, currency)} billed yearly</p>}
                  </>
                )}
              </div>
              <ul className="my-5 flex-1 space-y-2.5 border-t border-border pt-5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground/80"><Check size={15} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden />{f}</li>
                ))}
                {price && (price.seatMonthly > 0 && price.billActiveUsers) && <li className="pl-6 text-xs text-muted">+ {formatPrice(price.seatMonthly, currency)} per extra user / month</li>}
                {price && price.branchMonthly > 0 && <li className="pl-6 text-xs text-muted">+ {formatPrice(price.branchMonthly, currency)} per extra branch / month</li>}
              </ul>
              <a href={price ? appUrl("/register") : "/contact"} className="landing-secondary inline-flex w-full items-center justify-center gap-1.5">
                {price ? (price.trialDays ? "Start free trial" : "Get started") : "Contact sales"}<ArrowRight size={14} aria-hidden />
              </a>
            </div>
          );
        })}
        <div className="landing-card relative flex flex-col border-border p-5">
          <h3 className="text-center text-base font-semibold text-foreground">Enterprise</h3>
          <div className="mt-3 min-h-[84px] text-center"><p className="text-2xl font-extrabold text-accent">Custom</p><p className="mt-1 text-xs text-muted">Tailored to your needs</p></div>
          <ul className="my-5 flex-1 space-y-2.5 border-t border-border pt-5">
            {["Custom user and branch limits", "Custom integrations", "Dedicated onboarding and support"].map((f) => <li key={f} className="flex items-start gap-2 text-sm text-foreground/80"><Check size={15} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden />{f}</li>)}
          </ul>
          <a href="/contact" className="landing-button inline-flex w-full items-center justify-center gap-1.5">Contact sales<ArrowRight size={14} aria-hidden /></a>
        </div>
      </div>
    </div>
  );
}
