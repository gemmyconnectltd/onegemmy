"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/utils";
import { useBilling } from "@/lib/billing/store";
import { useFeatureFlags } from "@/lib/api/hooks";
import { FALLBACK_MODULES } from "@/lib/billing/modules";
import { formatMoney, toMajorString, toMinor } from "@/lib/billing/money";
import { newId, pricesChanged, subscriberCount, SUPPORT_LABEL } from "@/lib/billing/logic";
import type { Plan, PlanStatus, SupportLevel } from "@/lib/billing/types";
import { Notice } from "./ui";

const STEPS = ["Basic info", "Features", "Pricing & limits", "Review"] as const;

interface Form {
  name: string; description: string; status: PlanStatus; supportLevel: SupportLevel;
  modules: string[]; maxProducts: string; maxStorageMb: string;
  currency: string; monthly: string; annual: string; includedUsers: string; extraUser: string; includedBranches: string; extraBranch: string; trialDays: string; setupFee: string;
}
type Errors = Partial<Record<keyof Form, string>>;

function toForm(p: Plan): Form {
  const c = p.prices.currency;
  return {
    name: p.name, description: p.description, status: p.status, supportLevel: p.supportLevel, modules: p.modules,
    maxProducts: p.limits.maxProducts?.toString() ?? "", maxStorageMb: p.limits.maxStorageMb?.toString() ?? "",
    currency: c, monthly: toMajorString(p.prices.monthlyPrice, c), annual: toMajorString(p.prices.annualPrice, c), includedUsers: String(p.includedUsers), extraUser: toMajorString(p.prices.extraUserPrice, c),
    includedBranches: String(p.includedBranches), extraBranch: toMajorString(p.prices.extraBranchPrice, c), trialDays: String(p.trialDays), setupFee: toMajorString(p.prices.setupFee, c),
  };
}
const blank = (currency: string): Plan => ({
  id: "", name: "", description: "", status: "draft", supportLevel: "email", modules: [], limits: { maxProducts: null, maxStorageMb: null }, includedUsers: 3, includedBranches: 1, trialDays: 14, createdAt: "", updatedAt: "", priceHistory: [],
  prices: { version: 1, currency, monthlyPrice: 0, annualPrice: 0, extraUserPrice: 0, extraBranchPrice: 0, setupFee: 0, effectiveFrom: "" },
});

const money = /^\d{1,9}(\.\d{1,3})?$/;
const whole = /^\d{1,7}$/;

function validate(f: Form, step: number, existingNames: string[]): Errors {
  const e: Errors = {};
  if (step >= 0) {
    if (!f.name.trim()) e.name = "Plan name is required";
    else if (f.name.trim().length > 60) e.name = "Keep the name under 60 characters";
    else if (existingNames.includes(f.name.trim().toLowerCase())) e.name = "Another plan already uses this name";
    if (f.description.length > 300) e.description = "Keep the description under 300 characters";
  }
  if (step >= 1) {
    if (f.modules.length === 0) e.modules = "Select at least one module";
    if (f.maxProducts && !whole.test(f.maxProducts)) e.maxProducts = "Whole number, or leave empty for unlimited";
    if (f.maxStorageMb && !whole.test(f.maxStorageMb)) e.maxStorageMb = "Whole number, or leave empty for unlimited";
  }
  if (step >= 2) {
    if (!/^[A-Za-z]{3}$/.test(f.currency)) e.currency = "Use a 3-letter currency code";
    for (const k of ["monthly", "annual", "extraUser", "extraBranch", "setupFee"] as const) if (!money.test(f[k])) e[k] = "Enter an amount, e.g. 39.00";
    for (const k of ["includedUsers", "includedBranches", "trialDays"] as const) if (!whole.test(f[k])) e[k] = "Enter a whole number";
    if (!e.includedUsers && Number(f.includedUsers) < 1) e.includedUsers = "At least 1 user";
    if (!e.includedBranches && Number(f.includedBranches) < 1) e.includedBranches = "At least 1 branch";
    if (!e.monthly && !e.annual && Number(f.annual) > 0 && Number(f.monthly) > 0 && Number(f.annual) > Number(f.monthly) * 12) e.annual = "Annual price is higher than 12 months — check it";
  }
  return e;
}

export function PlanWizard({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const { state, actions } = useBilling();
  const flags = useFeatureFlags();
  const isNew = !plan;
  const [f, setF] = useState<Form>(() => toForm(plan ?? blank(state?.settings.defaultCurrency ?? "USD")));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const modules = useMemo(() => {
    const live = flags.data?.filter((x) => x.is_active).map((x) => ({ key: x.key, name: x.name, module: x.module }));
    return live && live.length ? live : FALLBACK_MODULES;
  }, [flags.data]);
  const usingFallback = !flags.data?.length;
  const names = (state?.plans ?? []).filter((p) => p.id !== plan?.id).map((p) => p.name.trim().toLowerCase());
  const subs = plan && state ? subscriberCount(plan.id, state.subscriptions) : 0;

  const built = (): Plan => {
    const c = f.currency.toUpperCase();
    const base = plan ?? blank(c);
    return {
      ...base, id: plan?.id ?? newId("plan"), name: f.name.trim(), description: f.description.trim(), status: f.status, supportLevel: f.supportLevel, modules: f.modules,
      limits: { maxProducts: f.maxProducts ? Number(f.maxProducts) : null, maxStorageMb: f.maxStorageMb ? Number(f.maxStorageMb) : null },
      includedUsers: Number(f.includedUsers), includedBranches: Number(f.includedBranches), trialDays: Number(f.trialDays),
      prices: { ...base.prices, currency: c, monthlyPrice: toMinor(f.monthly, c), annualPrice: toMinor(f.annual, c), extraUserPrice: toMinor(f.extraUser, c), extraBranchPrice: toMinor(f.extraBranch, c), setupFee: toMinor(f.setupFee, c) },
    };
  };
  const draft = built();
  const priceChange = plan ? pricesChanged(plan.prices, draft.prices) : false;

  const next = () => {
    const e = validate(f, step, names);
    // Only this step's fields block "Next": drop errors from later steps that validate() also checks.
    const own: (keyof Form)[][] = [["name", "description"], ["modules", "maxProducts", "maxStorageMb"], ["currency", "monthly", "annual", "extraUser", "extraBranch", "setupFee", "includedUsers", "includedBranches", "trialDays"], []];
    const mine = Object.fromEntries(Object.entries(e).filter(([k]) => own[step].includes(k as keyof Form))) as Errors;
    setErrors(mine);
    if (Object.keys(mine).length === 0) setStep((s) => Math.min(3, s + 1));
  };
  const submit = () => {
    const e = validate(f, 3, names);
    if (Object.keys(e).length) { setErrors(e); setStep(Object.keys(e).some((k) => ["name", "description"].includes(k)) ? 0 : Object.keys(e).some((k) => ["modules", "maxProducts", "maxStorageMb"].includes(k)) ? 1 : 2); return; }
    actions.savePlan(draft, isNew);
    router.push("/plans");
  };

  const err = (k: keyof Form) => errors[k] && <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors[k]}</p>;
  const grouped = modules.reduce<Record<string, typeof modules>>((acc, m) => { (acc[m.module] ??= []).push(m); return acc; }, {});

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <button type="button" onClick={() => router.push("/plans")} className="mb-2 flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={13} /> Plans</button>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">{isNew ? "Create plan" : `Edit ${plan?.name}`}</h1>
      </div>

      <ol className="flex gap-1 overflow-x-auto no-scrollbar" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0 flex-1" aria-current={i === step ? "step" : undefined}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)} className={cn("flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] font-semibold", i === step ? "border-accent bg-accent/10 text-accent" : i < step ? "border-border text-foreground" : "border-border text-muted")}>
              <span className={cn("flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px]", i < step ? "bg-accent text-white" : "bg-surface")}>{i < step ? <Check size={11} /> : i + 1}</span>
              <span className="hidden truncate sm:inline">{s}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-[12px] font-semibold text-muted sm:hidden">Step {step + 1} of 4 · {STEPS[step]}</p>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        {step === 0 && (<>
          <Field label="Plan name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Growth" maxLength={80} />{err("name")}</Field>
          <Field label="Description" hint="Shown on plan cards and the pricing page."><Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />{err("description")}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" hint="Only Active plans can be assigned to subscribers."><Select value={f.status} onChange={(e) => set("status", e.target.value as PlanStatus)}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select></Field>
            <Field label="Support level"><Select value={f.supportLevel} onChange={(e) => set("supportLevel", e.target.value as SupportLevel)}>{(Object.keys(SUPPORT_LABEL) as SupportLevel[]).map((k) => <option key={k} value={k}>{SUPPORT_LABEL[k]}</option>)}</Select></Field>
          </div>
        </>)}

        {step === 1 && (<>
          {usingFallback && <Notice tone="blue">Showing the standard module list — the live feature-flag list couldn&apos;t be loaded.</Notice>}
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-muted">Included modules / features <span className="text-red-500">*</span></p>
            <div className="space-y-3">
              {Object.entries(grouped).map(([mod, list]) => (
                <div key={mod}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{mod}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((m) => {
                      const on = f.modules.includes(m.key);
                      return (
                        <label key={m.key} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]", on ? "border-accent bg-accent/5" : "border-border")}>
                          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={on} onChange={() => set("modules", on ? f.modules.filter((k) => k !== m.key) : [...f.modules, m.key])} />
                          <span className="min-w-0 flex-1 truncate">{m.name}</span><span className="font-mono text-[10px] text-muted">{m.key}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {err("modules")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max products" hint="Empty = unlimited"><Input inputMode="numeric" value={f.maxProducts} onChange={(e) => set("maxProducts", e.target.value)} placeholder="Unlimited" />{err("maxProducts")}</Field>
            <Field label="Storage (MB)" hint="Empty = unlimited"><Input inputMode="numeric" value={f.maxStorageMb} onChange={(e) => set("maxStorageMb", e.target.value)} placeholder="Unlimited" />{err("maxStorageMb")}</Field>
          </div>
        </>)}

        {step === 2 && (<>
          {subs > 0 && <Notice>Changing prices affects <strong>new subscribers only</strong>. The {subs} existing subscriber{subs === 1 ? "" : "s"} keep the prices they signed up with.</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Currency" required hint={subs > 0 ? "Currency of the new price list" : undefined}><Input value={f.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />{err("currency")}</Field>
            <Field label="Monthly price" required><Input inputMode="decimal" value={f.monthly} onChange={(e) => set("monthly", e.target.value)} />{err("monthly")}</Field>
            <Field label="Annual price" required><Input inputMode="decimal" value={f.annual} onChange={(e) => set("annual", e.target.value)} />{err("annual")}</Field>
            <Field label="Included users" required><Input inputMode="numeric" value={f.includedUsers} onChange={(e) => set("includedUsers", e.target.value)} />{err("includedUsers")}</Field>
            <Field label="Price per extra user / month" required><Input inputMode="decimal" value={f.extraUser} onChange={(e) => set("extraUser", e.target.value)} />{err("extraUser")}</Field>
            <span className="hidden sm:block" />
            <Field label="Included branches" required><Input inputMode="numeric" value={f.includedBranches} onChange={(e) => set("includedBranches", e.target.value)} />{err("includedBranches")}</Field>
            <Field label="Price per extra branch / month" required><Input inputMode="decimal" value={f.extraBranch} onChange={(e) => set("extraBranch", e.target.value)} />{err("extraBranch")}</Field>
            <span className="hidden sm:block" />
            <Field label="Trial (days)"><Input inputMode="numeric" value={f.trialDays} onChange={(e) => set("trialDays", e.target.value)} />{err("trialDays")}</Field>
            <Field label="One-time setup fee"><Input inputMode="decimal" value={f.setupFee} onChange={(e) => set("setupFee", e.target.value)} />{err("setupFee")}</Field>
          </div>
          <p className="text-[11px] text-muted">Extra-seat prices are monthly; annual subscriptions pay 12 months of them. All amounts are in {f.currency || "—"}.</p>
        </>)}

        {step === 3 && (<>
          {plan && subs > 0 && (
            <Notice tone={priceChange ? "amber" : "blue"}>
              <strong>{subs} active customer{subs === 1 ? "" : "s"} on this plan.</strong>{" "}
              {priceChange ? `New prices create version ${plan.prices.version + 1} and apply to new subscribers and plan changes from now on. Existing subscriptions keep their current amounts and the old price list stays in the history.` : "No price changes — included users/branches, modules and limits changes apply to the plan going forward."}
            </Notice>
          )}
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            {[
              ["Name", draft.name || "—"], ["Status", draft.status], ["Support", SUPPORT_LABEL[draft.supportLevel]], ["Trial", `${draft.trialDays} days`],
              ["Monthly", formatMoney(draft.prices.monthlyPrice, draft.prices.currency)], ["Annual", formatMoney(draft.prices.annualPrice, draft.prices.currency)],
              ["Included users", `${draft.includedUsers} (+${formatMoney(draft.prices.extraUserPrice, draft.prices.currency)} each extra)`], ["Included branches", `${draft.includedBranches} (+${formatMoney(draft.prices.extraBranchPrice, draft.prices.currency)} each extra)`],
              ["Setup fee", formatMoney(draft.prices.setupFee, draft.prices.currency)], ["Limits", `${draft.limits.maxProducts ?? "∞"} products · ${draft.limits.maxStorageMb ?? "∞"} MB`],
            ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1.5"><dt className="text-muted">{k}</dt><dd className="min-w-0 truncate text-right font-semibold">{v}</dd></div>)}
          </dl>
          <div><p className="mb-1 text-[12px] font-semibold text-muted">Modules</p><div className="flex flex-wrap gap-1.5">{draft.modules.map((m) => <span key={m} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium">{modules.find((x) => x.key === m)?.name ?? m}</span>)}</div></div>
          <div className="flex items-center gap-3"><Toggle size="sm" label="Activate on save" checked={f.status === "active"} onChange={(v) => set("status", v ? "active" : "draft")} /><span className="text-[12.5px]">{f.status === "active" ? "Plan will be available to assign" : `Saved as ${f.status}`}</span></div>
        </>)}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => (step === 0 ? router.push("/plans") : setStep(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
        {step < 3 ? <Button type="button" variant="primary" onClick={next}>Next <ArrowRight size={14} /></Button> : <Button type="button" variant="primary" onClick={submit}>{isNew ? "Create plan" : "Save changes"}</Button>}
      </div>
    </div>
  );
}
