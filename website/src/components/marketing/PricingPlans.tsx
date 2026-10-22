"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, Check, Globe, Star } from "lucide-react";
import { appUrl } from "@/lib/site";
import { ANNUAL_DISCOUNT, plans, regions, type Region } from "@/lib/plans";

type Billing = "monthly" | "annual";

const money = (value: number, currency: string) =>
  currency === "USD" ? `$${value.toLocaleString("en-US")}` : `${currency} ${value.toLocaleString("en-US")}`;

interface Option<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: string;
}

/** Segmented control with a sliding indicator; the global focus-visible outline handles keyboard focus. */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label: string }) {
  const index = options.findIndex((o) => o.id === value);
  return (
    <div role="group" aria-label={label} className="relative inline-grid auto-cols-fr grid-flow-col rounded-xl border border-border bg-surface p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-lg bg-[var(--primary)] shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={`relative z-10 inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:px-5 ${active ? "text-white" : "text-muted hover:text-foreground"}`}
          >
            {o.icon}
            {o.label}
            {o.badge && (
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none transition-colors ${active ? "bg-white/20 text-white" : "bg-[var(--primary-light)] text-accent"}`}>{o.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const flagIcon = (src: string) => <Image src={src} alt="" width={20} height={20} unoptimized className="h-5 w-5 rounded-full object-cover" />;

export function PricingPlans() {
  const [region, setRegion] = useState<Region>("rwanda");
  const [billing, setBilling] = useState<Billing>("monthly");
  const { currency } = regions[region];
  const annual = billing === "annual";

  return (
    <div>
      <div className="mb-10 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Segmented
            label="Region"
            value={region}
            onChange={setRegion}
            options={[
              { id: "rwanda", label: "Rwanda", icon: flagIcon("/flags/rw.svg") },
              { id: "international", label: "International", icon: <Globe size={18} aria-hidden /> },
            ]}
          />
          <Segmented
            label="Billing period"
            value={billing}
            onChange={setBilling}
            options={[
              { id: "monthly", label: "Monthly" },
              { id: "annual", label: "Annual", badge: `-${ANNUAL_DISCOUNT * 100}%` },
            ]}
          />
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          Prices in <span className="font-semibold text-foreground">{currency}</span> · billed {annual ? "yearly, saving 20%" : "monthly"} · no setup fees
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((plan) => {
          const base = plan.monthly[region];
          const custom = base === null;
          const perMonth = custom ? null : annual ? Math.round(base * (1 - ANNUAL_DISCOUNT)) : base;
          const isEnterprise = plan.id === "enterprise";
          return (
            <div
              key={plan.id}
              className={`landing-card relative flex flex-col p-5 ${plan.featured ? "border-[var(--primary)] bg-[var(--primary-light)] shadow-md" : "border-border"}`}
            >
              {plan.featured && (
                <div className="absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-bold leading-none text-white">
                  <Star size={11} fill="currentColor" aria-hidden /> Most popular
                </div>
              )}
              <h3 className="mt-2 text-center text-base font-semibold text-foreground">{plan.title}</h3>
              <div className="mt-3 min-h-[84px] text-center">
                {perMonth === null ? (
                  <>
                    <p className="text-2xl font-extrabold text-accent">Custom</p>
                    <p className="mt-1 text-xs text-muted">{plan.tagline}</p>
                  </>
                ) : (
                  <>
                    <p className="whitespace-nowrap text-2xl font-extrabold leading-tight text-accent">{money(perMonth, currency)}</p>
                    <p className="text-xs font-medium text-muted">per month</p>
                    {annual && base !== null && (
                      <p className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground/70">{money(perMonth * 12, currency)} billed yearly</p>
                    )}
                  </>
                )}
              </div>
              <ul className="my-5 flex-1 space-y-2.5 border-t border-border pt-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                    <Check size={15} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={isEnterprise ? "/contact" : appUrl("/register")}
                className={`inline-flex w-full items-center justify-center gap-1.5 ${plan.featured || isEnterprise ? "landing-button" : "landing-secondary"}`}
              >
                {isEnterprise ? "Contact sales" : "Get started"}
                <ArrowRight size={14} aria-hidden />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
