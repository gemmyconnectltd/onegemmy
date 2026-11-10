"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAppConfig } from "@/lib/appConfig";
import { useCategories, useCustomers, useDiscountRule, useDiscountSettings, useDiscountStatus, useMyBranches, useProducts, useSaveDiscountRule } from "@/lib/api/hooks";
import type { DiscountRule } from "@/lib/api/discounts";
import { TYPE_LABELS } from "@/components/discounts/shared";

const STEPS = ["Basics", "Discount", "Applies to", "Conditions", "Review"] as const;
const CHANNELS = [["pos", "Point of Sale"], ["sales_order", "Sales orders"], ["quotation", "Quotations"]] as const;

type Form = {
  name: string; code: string; description: string; type: string; value_kind: "percent" | "fixed"; value: string; max: string;
  tiers: string; mode: string; basis: string; buy_qty: string; get_qty: string; reward_pct: string;
  products: Record<string, string>; exclusions: Record<string, string>; customers: Record<string, string>; buy_products: Record<string, string>; reward_products: Record<string, string>;
  categories: string[]; branches: string[]; channels: string[]; customer_types: string[];
  min_order_amount: string; min_quantity: string; usage_limit: string; per_customer_limit: string; min_margin_percent: string;
  start: string; end: string; priority: string; combinable: boolean; exclusive: boolean; combined: string;
};

const EMPTY: Form = {
  name: "", code: "", description: "", type: "percentage", value_kind: "percent", value: "10", max: "", tiers: "5:3\n10:8", mode: "highest", basis: "quantity",
  buy_qty: "2", get_qty: "1", reward_pct: "100", products: {}, exclusions: {}, customers: {}, buy_products: {}, reward_products: {},
  categories: [], branches: [], channels: [], customer_types: [], min_order_amount: "", min_quantity: "", usage_limit: "", per_customer_limit: "", min_margin_percent: "",
  start: "", end: "", priority: "100", combinable: true, exclusive: false, combined: "",
};

const local = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const asMap = (ids?: unknown) => Object.fromEntries(((ids as string[]) ?? []).map((id) => [id, "Selected earlier"]));

/** Turn a saved rule back into the form (for editing, or for a duplicate saved as a new draft). */
function fromRule(r: DiscountRule, duplicate: boolean): Form {
  const c = (r.config ?? {}) as Record<string, unknown>;
  const scope = (c.scope ?? {}) as Record<string, string[]>;
  const cond = (c.conditions ?? {}) as Record<string, number>;
  const buy = (c.buy ?? {}) as { qty?: number; product_ids?: string[] };
  const get = (c.get ?? {}) as { qty?: number; percent?: number; product_ids?: string[] };
  const tiers = (c.tiers as { from: number; value: number }[] | undefined) ?? [];
  const str = (v?: number | null) => (v == null ? "" : String(v));
  return {
    ...EMPTY, name: duplicate ? `${r.name} (copy)` : r.name, code: duplicate ? "" : r.code, description: r.description ?? "", type: r.type,
    value_kind: r.value_kind === "fixed" ? "fixed" : "percent", value: String(r.value ?? ""), max: str(r.max_discount),
    tiers: tiers.length ? tiers.map((t) => `${t.from}:${t.value}`).join("\n") : EMPTY.tiers, mode: String(c.mode ?? "highest"), basis: String(c.basis ?? "quantity"),
    buy_qty: str(buy.qty) || "2", get_qty: str(get.qty) || "1", reward_pct: str(get.percent) || "100",
    products: asMap(scope.product_ids), exclusions: asMap(scope.exclude_product_ids), customers: asMap(scope.customer_ids), buy_products: asMap(buy.product_ids), reward_products: asMap(get.product_ids),
    categories: scope.category_ids ?? [], branches: scope.branch_ids ?? [], channels: scope.channels ?? [], customer_types: scope.customer_types ?? [],
    min_order_amount: str(cond.min_order_amount), min_quantity: str(cond.min_quantity), usage_limit: str(cond.usage_limit), per_customer_limit: str(cond.per_customer_limit), min_margin_percent: str(cond.min_margin_percent),
    start: local(r.starts_at), end: local(r.ends_at), priority: String(r.priority ?? 100), combinable: r.combinable, exclusive: r.exclusive, combined: str(r.max_combined_pct),
  };
}

function Picker({ label, kind, value, onChange }: { label: string; kind: "product" | "customer"; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [search, setSearch] = useState("");
  const products = useProducts(1, 20, search || undefined, true, { enabled: kind === "product" });
  const customers = useCustomers(1, 20, search || undefined, undefined, { enabled: kind === "customer" }, undefined, "active");
  const rows = (kind === "product" ? products.data?.items : customers.data?.items) ?? [];
  const count = Object.keys(value).length;
  return <fieldset className="space-y-2 rounded-xl border border-border p-3">
    <legend className="px-1 text-sm font-medium">{label}</legend>
    <Input aria-label={`Search ${label}`} placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="max-h-44 space-y-1 overflow-y-auto">{rows.map((row) => <label key={row.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-surface">
      <input type="checkbox" checked={row.id in value} onChange={(e) => { const next = { ...value }; if (e.target.checked) next[row.id] = row.name; else delete next[row.id]; onChange(next); }} />{row.name}</label>)}</div>
    <div className="flex items-center justify-between text-xs text-muted"><span>{count ? `${count} selected` : "None selected: no restriction"}</span>{count > 0 && <button type="button" className="font-semibold text-accent" onClick={() => onChange({})}>Clear</button>}</div>
  </fieldset>;
}

function Chips({ options, value, onChange, label }: { options: readonly (readonly [string, string])[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return <div role="group" aria-label={label} className="flex flex-wrap gap-2">{options.map(([k, text]) => {
    const on = value.includes(k);
    return <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}>{text}</button>;
  })}</div>;
}

function RuleWizard() {
  const params = useSearchParams();
  const editId = params.get("edit") ?? "";
  const fromId = params.get("from") ?? "";
  const source = useDiscountRule(editId || fromId);
  if ((editId || fromId) && source.isLoading) return <PageLoader variant="page" />;
  if ((editId || fromId) && (source.error || !source.data)) return <p role="alert" className="text-sm text-red-600">{source.error?.message ?? "Discount rule not found"}</p>;
  return <WizardForm key={editId || fromId || "new"} editId={editId} alreadyActive={!!editId && source.data?.status === "Active"} initial={source.data ? fromRule(source.data, !editId) : EMPTY} />;
}

function WizardForm({ editId, initial, alreadyActive }: { editId: string; initial: Form; alreadyActive: boolean }) {
  const router = useRouter();
  const { currencySymbol } = useAppConfig();
  const save = useSaveDiscountRule();
  const activate = useDiscountStatus();
  const categories = useCategories();
  const branches = useMyBranches();
  const settings = useDiscountSettings();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(initial);
  // Once saved, retries update that rule instead of creating another (e.g. when activation is refused).
  const [savedId, setSavedId] = useState(editId);
  // Only offer the types this business has switched on (advanced types and coupons are optional); keep the rule's own type.
  const typeOptions = Object.entries(TYPE_LABELS).filter(([k]) => k === initial.type
    || (!(["volume", "tiered", "bogo"].includes(k)) || settings.data?.advanced !== false) && (k !== "coupon" || settings.data?.coupons !== false));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const fixedOnly = f.type === "fixed", percentOnly = f.type === "percentage";
  const kind = fixedOnly ? "fixed" : percentOnly ? "percent" : f.value_kind;
  const tiered = f.type === "tiered" || f.type === "volume";
  const categoryOptions = (categories.data?.items ?? []).map((c) => [c.id, c.name] as const);
  const branchItems = ((branches.data as { items?: { id: string; name: string }[] } | undefined)?.items) ?? [];
  const branchOptions = branchItems.map((b) => [b.id, b.name] as const);

  function problems(at: number): string | null {
    if (at === 0 && f.name.trim().length < 2) return "Give the discount a name.";
    if (at === 1) {
      if (!tiered && f.type !== "bogo" && !(Number(f.value) > 0)) return "Enter a discount value above zero.";
      if (kind === "percent" && Number(f.value) > 100) return "A percentage can't exceed 100.";
      if (tiered && !f.tiers.split("\n").some((l) => l.trim())) return "Add at least one tier.";
    }
    if (at === 3 && f.start && f.end && new Date(f.end) <= new Date(f.start)) return "The end must be after the start.";
    return null;
  }
  const next = () => { const p = problems(step); setError(p); if (!p) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };

  async function submit(activateNow: boolean) {
    setError(null);
    for (let i = 0; i < STEPS.length - 1; i++) { const p = problems(i); if (p) { setStep(i); setError(p); return; } }
    try {
      const ids = (m: Record<string, string>) => Object.keys(m);
      const rules = f.type === "bogo" ? { buy: { qty: Number(f.buy_qty), product_ids: ids(f.buy_products) }, get: { qty: Number(f.get_qty), percent: Number(f.reward_pct), product_ids: ids(f.reward_products) } }
        : tiered ? { tiers: f.tiers.split("\n").filter((l) => l.trim()).map((line) => { const [from, value] = line.split(":").map(Number); if (!Number.isFinite(from) || !Number.isFinite(value)) throw new Error("Write each tier as threshold:percentage, for example 10:8"); return { from, value }; }), mode: f.mode, basis: f.basis } : {};
      const conditions = Object.fromEntries((["min_order_amount", "min_quantity", "usage_limit", "per_customer_limit", "min_margin_percent"] as const).filter((k) => f[k] !== "").map((k) => [k, Number(f[k])]));
      const result = await save.mutateAsync({
        ...(savedId ? { id: savedId } : {}), name: f.name.trim(), code: f.code.trim() || undefined, description: f.description, type: f.type, value_kind: kind, value: Number(f.value) || 0,
        max_discount: Number(f.max) || null, priority: Number(f.priority) || 100, combinable: f.combinable, exclusive: f.exclusive, max_combined_pct: Number(f.combined) || null,
        starts_at: f.start ? new Date(f.start).toISOString() : null, ends_at: f.end ? new Date(f.end).toISOString() : null,
        config: { ...rules, conditions, scope: { product_ids: ids(f.products), category_ids: f.categories, customer_ids: ids(f.customers), customer_types: f.customer_types, branch_ids: f.branches, channels: f.channels, exclude_product_ids: ids(f.exclusions) } },
      });
      setSavedId(result.data.id);
      if (activateNow) await activate.mutateAsync({ resource: "rules", id: result.data.id, status: "Active" });
      router.push(`/sales/discounts/rules/${result.data.id}`);
    } catch (e) { setError((e as { detail?: string })?.detail ?? (e instanceof Error ? e.message : "Couldn't save the discount")); }
  }

  const value = f.type === "bogo" ? `Buy ${f.buy_qty} get ${f.get_qty} at ${f.reward_pct}% off` : tiered ? f.tiers.split("\n").filter(Boolean).map((l) => l.replace(":", "+: ") + "%").join(" · ")
    : kind === "fixed" ? `${currencySymbol} ${Number(f.value || 0).toLocaleString()}` : `${f.value}%`;
  const summary: [string, string][] = [["Name", f.name || "—"], ["Type", TYPE_LABELS[f.type] ?? f.type], ["Value", value], ["Maximum discount", f.max ? `${currencySymbol} ${Number(f.max).toLocaleString()}` : "No cap"],
    ["Products", Object.keys(f.products).length ? `${Object.keys(f.products).length} selected` : "All products"],
    ["Excluded products", Object.keys(f.exclusions).length ? Object.values(f.exclusions).join(", ") : "None"], ["Categories", f.categories.length ? `${f.categories.length} selected` : "All"],
    ["Customers", Object.keys(f.customers).length ? `${Object.keys(f.customers).length} selected` : f.customer_types.length ? f.customer_types.join(", ") : "Everyone"],
    ["Branches", f.branches.length ? `${f.branches.length} selected` : "All branches"], ["Channels", f.channels.length ? f.channels.map((c) => CHANNELS.find((x) => x[0] === c)?.[1]).join(", ") : "All channels"],
    ["Validity", f.start || f.end ? `${f.start ? new Date(f.start).toLocaleString() : "Now"} – ${f.end ? new Date(f.end).toLocaleString() : "no end"}` : "No end date"],
    ["Combines with others", f.exclusive ? "No (exclusive)" : f.combinable ? "Yes" : "No"]];

  return <div className="mx-auto max-w-4xl space-y-5 pb-28">
    <Link href={editId ? `/sales/discounts/rules/${editId}` : "/sales/discounts?tab=Discount%20Rules"} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} /> {editId ? "Back to the rule" : "Discount rules"}</Link>
    <header><h1 className="pesaa-page-title">{editId ? "Edit discount rule" : "Create discount rule"}</h1><p className="mt-1 text-sm text-muted">Prices include VAT. Completed sales keep the discount they were sold with, whatever you change here.</p></header>
    <ol className="flex flex-wrap gap-2" aria-label="Steps">{STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => { if (i <= step || !problems(step)) setStep(i); }}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${i === step ? "border-accent bg-accent/10 text-accent" : i < step ? "border-border text-foreground" : "border-border text-muted"}`} aria-current={i === step ? "step" : undefined}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i < step ? "bg-accent text-white" : "bg-surface"}`}>{i < step ? <Check size={11} /> : i + 1}</span>{s}</button></li>)}</ol>
    {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      {step === 0 && <><div className="grid gap-4 md:grid-cols-2"><Field label="Discount name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Weekend 10% off" /></Field><Field label="Code" hint="Optional internal reference; generated when empty."><Input value={f.code} onChange={(e) => set("code", e.target.value)} maxLength={40} /></Field></div>
        <Field label="Type" hint="Choose what kind of reward this is."><Select value={f.type} onChange={(e) => set("type", e.target.value)}>{typeOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Description (optional)"><Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></>}

      {step === 1 && <>{f.type === "bogo" ? <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Field label="Customer buys (qty)"><Input type="number" min={1} value={f.buy_qty} onChange={(e) => set("buy_qty", e.target.value)} /></Field><Field label="Rewarded quantity"><Input type="number" min={1} value={f.get_qty} onChange={(e) => set("get_qty", e.target.value)} /></Field><Field label="Reward discount (%)"><Input type="number" min={0} max={100} value={f.reward_pct} onChange={(e) => set("reward_pct", e.target.value)} /></Field></div>
          <div className="grid gap-4 md:grid-cols-2"><Picker label="Products that qualify" kind="product" value={f.buy_products} onChange={(v) => set("buy_products", v)} /><Picker label="Products given as the reward" kind="product" value={f.reward_products} onChange={(v) => set("reward_products", v)} /></div>
          <p className="text-xs text-muted">Reward items are added to the cart and leave stock normally; the cheapest qualifying units get the reward.</p></div>
        : tiered ? <div className="grid gap-4 md:grid-cols-3"><Field label="Tiers" hint="One threshold:percentage per line, e.g. 5:3 then 10:8."><Textarea rows={5} value={f.tiers} onChange={(e) => set("tiers", e.target.value)} /></Field><Field label="How tiers apply"><Select value={f.mode} onChange={(e) => set("mode", e.target.value)}><option value="highest">Highest tier reached, on all units</option><option value="progressive">Each band at its own rate</option></Select></Field><Field label="Tier based on"><Select value={f.basis} onChange={(e) => set("basis", e.target.value)}><option value="quantity">Quantity</option><option value="amount">Purchase amount</option></Select></Field></div>
        : <div className="grid gap-4 md:grid-cols-3">
          {!fixedOnly && !percentOnly && <Field label="Reward"><Select value={f.value_kind} onChange={(e) => set("value_kind", e.target.value as Form["value_kind"])}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>}
          <Field label={kind === "fixed" ? `Amount off (${currencySymbol})` : "Percentage off"} required><Input type="number" min={0} max={kind === "percent" ? 100 : undefined} step="0.01" value={f.value} onChange={(e) => set("value", e.target.value)} /></Field>
          <Field label="Maximum discount (optional)" hint="Caps the discount on one sale."><Input type="number" min={0} step="0.01" value={f.max} onChange={(e) => set("max", e.target.value)} /></Field>
        </div>}
        {f.type === "order" && <p className="text-xs text-muted">Order discounts reduce the whole sale and are shared across its lines before VAT.</p>}</>}

      {step === 2 && <div className="space-y-4">
        <p className="text-sm text-muted">Leave a section empty to include everything.</p>
        <div className="grid gap-4 md:grid-cols-2"><Picker label="Products" kind="product" value={f.products} onChange={(v) => setF((prev) => ({ ...prev, products: v, exclusions: Object.fromEntries(Object.entries(prev.exclusions).filter(([id]) => !(id in v))) }))} />
          <Picker label="Excluded products" kind="product" value={f.exclusions} onChange={(v) => setF((prev) => ({ ...prev, exclusions: v, products: Object.fromEntries(Object.entries(prev.products).filter(([id]) => !(id in v))) }))} /></div>
        {categoryOptions.length > 0 && <Field label="Categories"><Chips label="Categories" options={categoryOptions} value={f.categories} onChange={(v) => set("categories", v)} /></Field>}
        <div className="grid gap-4 md:grid-cols-2"><Picker label="Customers" kind="customer" value={f.customers} onChange={(v) => set("customers", v)} />
          <div className="space-y-4"><Field label="Customer type"><Chips label="Customer type" options={[["individual", "Individuals"], ["business", "Businesses"]]} value={f.customer_types} onChange={(v) => set("customer_types", v)} /></Field>
            <Field label="Channels"><Chips label="Channels" options={CHANNELS} value={f.channels} onChange={(v) => set("channels", v)} /></Field>
            {branchOptions.length > 1 && <Field label="Branches"><Chips label="Branches" options={branchOptions} value={f.branches} onChange={(v) => set("branches", v)} /></Field>}</div></div>
      </div>}

      {step === 3 && <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">{([["min_order_amount", `Minimum sale (${currencySymbol})`], ["min_quantity", "Minimum quantity"], ["usage_limit", "Total uses allowed"], ["per_customer_limit", "Uses per customer"], ["min_margin_percent", "Keep at least this margin (%)"]] as const).map(([k, label]) => <Field key={k} label={label}><Input type="number" min={0} step="0.01" value={f[k]} onChange={(e) => set(k, e.target.value)} /></Field>)}</div>
        <div className="grid gap-4 md:grid-cols-2"><Field label="Starts" hint="Your device's time zone; empty = immediately."><Input type="datetime-local" value={f.start} onChange={(e) => set("start", e.target.value)} /></Field><Field label="Ends" hint="Empty = no end date."><Input type="datetime-local" value={f.end} onChange={(e) => set("end", e.target.value)} /></Field></div>
        <div className="grid gap-4 md:grid-cols-2"><Field label="Priority" hint="Higher numbers are considered first."><Input type="number" min={0} max={10000} value={f.priority} onChange={(e) => set("priority", e.target.value)} /></Field><Field label="Maximum combined discount (%)" hint="Caps everything applied to one line."><Input type="number" min={0} max={100} step="0.01" value={f.combined} onChange={(e) => set("combined", e.target.value)} /></Field></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.combinable} onChange={(e) => set("combinable", e.target.checked)} /><span>Can combine with other offers<span className="block text-xs text-muted">Off: it is skipped on lines another offer already discounted.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.exclusive} onChange={(e) => set("exclusive", e.target.checked)} /><span>Exclusive<span className="block text-xs text-muted">When it is the best deal, no other offer applies to the sale.</span></span></label>
      </div>}

      {step === 4 && <dl className="divide-y divide-border">{summary.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>}
    </section>

    <footer className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="secondary" disabled={step === 0} onClick={() => { setError(null); setStep((s) => s - 1); }}>Back</Button>
      <div className="flex flex-wrap gap-2">
        {step < STEPS.length - 1 ? <Button type="button" onClick={next}>Continue</Button> : <>
          <Button type="button" variant={alreadyActive ? "primary" : "secondary"} disabled={save.isPending || activate.isPending} onClick={() => submit(false)}>{editId ? "Save changes" : "Save draft"}</Button>
          {!alreadyActive && <Button type="button" disabled={save.isPending || activate.isPending} onClick={() => submit(true)}>Save &amp; activate</Button>}
        </>}
      </div>
    </footer>
  </div>;
}

export default function NewDiscountPage() { return <Suspense fallback={<PageLoader variant="page" />}><RuleWizard /></Suspense>; }
