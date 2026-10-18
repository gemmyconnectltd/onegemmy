"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { Toggle } from "@/components/ui/Toggle";
import { useBilling } from "@/lib/billing/store";
import { newId } from "@/lib/billing/logic";
import { formatMoney, toMajorString, toMinor } from "@/lib/billing/money";
import type { Coupon, CouponDuration, CouponKind } from "@/lib/billing/types";
import { Badge, EmptyState, fmtDate, PageHeader, Pagination, SearchBox, usePaged } from "@/components/billing/ui";

const PAGE = 10;
const couponState = (c: Coupon, now: number) => !c.active ? "inactive" : c.expiresAt && new Date(c.expiresAt).getTime() < now ? "expired" : c.maxRedemptions !== null && c.redeemed >= c.maxRedemptions ? "exhausted" : "active";
interface Form { code: string; name: string; kind: CouponKind; percent: string; amount: string; currency: string; planIds: string[]; startsAt: string; expiresAt: string; max: string; duration: CouponDuration; months: string; active: boolean }
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const toForm = (c: Coupon | null, cur: string): Form => c
  ? { code: c.code, name: c.name, kind: c.kind, percent: (c.percentOffBps / 100).toString(), amount: toMajorString(c.amountOff, c.currency ?? cur), currency: c.currency ?? cur, planIds: c.planIds, startsAt: day(c.startsAt), expiresAt: day(c.expiresAt), max: c.maxRedemptions?.toString() ?? "", duration: c.duration, months: c.durationMonths?.toString() ?? "", active: c.active }
  : { code: "", name: "", kind: "percent", percent: "10", amount: "", currency: cur, planIds: [], startsAt: "", expiresAt: "", max: "", duration: "once", months: "", active: true };

function validate(f: Form, codes: string[]): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!/^[A-Z0-9_-]{3,24}$/.test(f.code)) e.code = "3–24 letters, numbers, - or _";
  else if (codes.includes(f.code)) e.code = "This code already exists";
  if (!f.name.trim()) e.name = "Give the coupon a name";
  if (f.kind === "percent") { const p = Number(f.percent); if (!/^\d{1,3}(\.\d{1,2})?$/.test(f.percent) || p <= 0 || p > 100) e.percent = "Enter 0.01–100"; }
  else { if (!/^\d{1,9}(\.\d{1,3})?$/.test(f.amount) || Number(f.amount) <= 0) e.amount = "Enter an amount above 0"; if (!/^[A-Z]{3}$/.test(f.currency)) e.currency = "3-letter currency code"; }
  if (f.startsAt && f.expiresAt && f.expiresAt < f.startsAt) e.expiresAt = "Must be after the start date";
  if (f.max && !/^[1-9]\d{0,7}$/.test(f.max)) e.max = "Whole number above 0, or empty for unlimited";
  if (f.duration === "repeating" && !/^[1-9]\d?$/.test(f.months)) e.months = "Number of months (1–99)";
  return e;
}

export default function CouponsPage() {
  const { state, actions } = useBilling();
  const { confirm, dialog } = useConfirmDialog();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<{ coupon: Coupon | null } | null>(null);
  const [f, setF] = useState<Form>(() => toForm(null, "USD"));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const coupons = state!.coupons;
  const plans = state!.plans;
  const [now] = useState(() => Date.now());
  const stateOf = (c: Coupon) => couponState(c, now);
  const rows = useMemo(() => { const k = q.trim().toLowerCase(); return coupons.filter((c) => (status === "all" || couponState(c, now) === status) && (!k || `${c.code} ${c.name}`.toLowerCase().includes(k))); }, [coupons, q, status, now]);
  const { page, slice, setPage } = usePaged(rows, PAGE, `${q}|${status}`);

  const openEdit = (coupon: Coupon | null) => { setF(toForm(coupon, state!.settings.defaultCurrency)); setErrors({}); setEdit({ coupon }); };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    const others = coupons.filter((c) => c.id !== edit?.coupon?.id).map((c) => c.code);
    const e = validate(f, others);
    setErrors(e);
    if (Object.keys(e).length) return;
    const prev = edit?.coupon;
    actions.saveCoupon({
      id: prev?.id ?? newId("cp"), code: f.code, name: f.name.trim(), kind: f.kind, percentOffBps: f.kind === "percent" ? Math.round(Number(f.percent) * 100) : 0,
      amountOff: f.kind === "fixed" ? toMinor(f.amount, f.currency) : 0, currency: f.kind === "fixed" ? f.currency : null, planIds: f.planIds,
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, expiresAt: f.expiresAt ? new Date(f.expiresAt + "T23:59:59").toISOString() : null,
      maxRedemptions: f.max ? Number(f.max) : null, redeemed: prev?.redeemed ?? 0, duration: f.duration, durationMonths: f.duration === "repeating" ? Number(f.months) : null, active: f.active, createdAt: prev?.createdAt ?? new Date().toISOString(),
    });
    setEdit(null);
  };
  const err = (k: keyof Form) => errors[k] && <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors[k]}</p>;
  const value = (c: Coupon) => (c.kind === "percent" ? `${c.percentOffBps / 100}% off` : `${formatMoney(c.amountOff, c.currency ?? "USD")} off`);
  const tone = { active: "green", inactive: "slate", expired: "amber", exhausted: "amber" } as const;

  return (
    <div className="space-y-5">
      <PageHeader title="Coupons & Discounts" subtitle="Codes applied to subscriptions. Fixed-amount coupons only work in their own currency."
        actions={<Button variant="primary" onClick={() => openEdit(null)}><Plus size={14} /> New coupon</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search code or name" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto! min-w-[130px]"><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option><option value="exhausted">Exhausted</option></Select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? <EmptyState title="No coupons" hint="Create a coupon to offer a discount." action={<Button variant="primary" onClick={() => openEdit(null)}>New coupon</Button>} /> : (
          <TableScroll label="Coupons"><table className="w-full min-w-[900px] text-left text-[13px]">
            <thead><tr className="border-b border-border bg-surface/30 text-[11px] uppercase tracking-wider text-muted">{["Code", "Discount", "Applies to", "Valid", "Redeemed", "Duration", "Status", "Active", ""].map((h, i) => <th key={i} scope="col" aria-label={h || "Actions"} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {slice.map((c) => { const st = stateOf(c); return (
                <tr key={c.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3"><p className="font-mono text-[12px] font-bold">{c.code}</p><p className="text-[11px] text-muted">{c.name}</p></td>
                  <td className="px-4 py-3 font-semibold">{value(c)}</td>
                  <td className="px-4 py-3 text-[12px]">{c.planIds.length ? c.planIds.map((id) => plans.find((p) => p.id === id)?.name ?? id).join(", ") : "All plans"}</td>
                  <td className="px-4 py-3 text-[12px]">{fmtDate(c.startsAt)} → {c.expiresAt ? fmtDate(c.expiresAt) : "no end"}</td>
                  <td className="px-4 py-3">{c.redeemed}{c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ""}</td>
                  <td className="px-4 py-3 text-[12px] capitalize">{c.duration === "repeating" ? `${c.durationMonths} months` : c.duration}</td>
                  <td className="px-4 py-3"><Badge label={st} tone={tone[st]} className="capitalize" /></td>
                  <td className="px-4 py-3"><Toggle size="sm" label={`Toggle ${c.code}`} checked={c.active} onChange={(v) => actions.setCouponActive(c.id, v)} /></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <button type="button" aria-label={`Edit ${c.code}`} onClick={() => openEdit(c)} className="rounded-md border border-border p-1.5 text-muted hover:text-foreground"><Pencil size={13} /></button>
                    <button type="button" aria-label={`Delete ${c.code}`} onClick={() => confirm({ title: `Delete ${c.code}?`, message: c.redeemed ? "It has been redeemed before. Existing subscriptions keep their discount; the code stops working for new ones." : "This coupon will be removed.", confirmLabel: "Delete", danger: true, onConfirm: () => actions.deleteCoupon(c.id) })} className="rounded-md border border-border p-1.5 text-muted hover:text-red-600"><Trash2 size={13} /></button>
                  </div></td>
                </tr>); })}
            </tbody>
          </table></TableScroll>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />

      <Drawer open={!!edit} onClose={() => setEdit(null)} side="right" size="xl" title={edit?.coupon ? "Edit coupon" : "New coupon"}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save coupon</Button></div>}>
        <div className="space-y-3 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required><Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="WELCOME20" />{err("code")}</Field>
            <Field label="Name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} />{err("name")}</Field>
            <Field label="Type"><Select value={f.kind} onChange={(e) => set("kind", e.target.value as CouponKind)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>
            {f.kind === "percent" ? <Field label="Percent off" required><Input inputMode="decimal" value={f.percent} onChange={(e) => set("percent", e.target.value)} />{err("percent")}</Field> : (
              <div className="grid grid-cols-2 gap-2"><Field label="Amount off" required><Input inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} />{err("amount")}</Field><Field label="Currency" required><Input maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />{err("currency")}</Field></div>
            )}
            <Field label="Starts"><Input type="date" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
            <Field label="Expires"><Input type="date" value={f.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />{err("expiresAt")}</Field>
            <Field label="Max redemptions" hint="Empty = unlimited"><Input inputMode="numeric" value={f.max} onChange={(e) => set("max", e.target.value)} />{err("max")}</Field>
            <Field label="Duration"><Select value={f.duration} onChange={(e) => set("duration", e.target.value as CouponDuration)}><option value="once">Once (first invoice)</option><option value="repeating">Repeating (months)</option><option value="forever">Forever</option></Select></Field>
            {f.duration === "repeating" && <Field label="Months" required><Input inputMode="numeric" value={f.months} onChange={(e) => set("months", e.target.value)} />{err("months")}</Field>}
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-muted">Applicable plans <span className="font-normal">(none selected = all plans)</span></p>
            <div className="flex flex-wrap gap-2">{plans.filter((p) => p.status !== "archived").map((p) => { const on = f.planIds.includes(p.id); return <button key={p.id} type="button" aria-pressed={on} onClick={() => set("planIds", on ? f.planIds.filter((x) => x !== p.id) : [...f.planIds, p.id])} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${on ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"}`}>{p.name}</button>; })}</div>
          </div>
          <div className="flex items-center gap-3"><Toggle size="sm" label="Active" checked={f.active} onChange={(v) => set("active", v)} /><span className="text-[13px]">Active</span></div>
        </div>
      </Drawer>
      {dialog}
    </div>
  );
}
