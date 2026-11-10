"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select } from "@/components/ui/Form";
import type { DiscountPrice, DiscountSettings } from "@/lib/api/discounts";
import type { CartItem } from "./types";

export interface ManualRequest { kind: "percent" | "fixed"; value: number; reason: string; scope: string }
export function PosDiscounts({ settings, canApply, cart, pricing, error, coupon, onCoupon, onManual, onRemoveManual, money, approvalId, onApprovalId, onRequestApproval, requesting }: {
  settings: DiscountSettings; canApply: boolean; cart: CartItem[]; pricing?: DiscountPrice; error?: string;
  coupon: string; onCoupon: (code: string) => void; onManual: (request: ManualRequest) => void; onRemoveManual: () => void;
  money: (amount: number) => string; approvalId?: string; onApprovalId: (id: string | undefined) => void;
  onRequestApproval: () => void; requesting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftKind, setDraftKind] = useState("percent");
  const [couponOpen, setCouponOpen] = useState(false);
  if (!settings.enabled) return null;
  return <section className="space-y-3 border-b border-border pb-3" aria-label="Discounts and promotions">
    <div className="flex flex-wrap gap-2">
      {settings.manual_pos && canApply && <Button size="sm" variant="secondary" disabled={!cart.length} onClick={() => setOpen(true)}>+ Apply Discount</Button>}
      {settings.coupons && <Button size="sm" variant="ghost" disabled={!cart.length} onClick={() => setCouponOpen(value => !value)}>{pricing?.applied.some(item => item.kind === "coupon") ? "Coupon applied" : coupon ? "Change coupon" : "+ Coupon"}</Button>}
    </div>
    {couponOpen && <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onCoupon(String(data.get("code") ?? "").trim()); setCouponOpen(false); }}><Field label="Coupon code"><Input name="code" defaultValue={coupon} autoComplete="off" /></Field><Button size="sm" type="submit">Apply</Button></form>}
    {!!pricing?.applied.length && <details className="rounded-lg border border-border bg-surface p-3"><summary className="cursor-pointer text-sm font-medium">Discounts &amp; Promotions ({pricing.applied.length})</summary><ul className="mt-3 space-y-3">{pricing.applied.map((item, index) => <li key={`${item.rule_id ?? "manual"}:${index}`} className="space-y-1 text-sm" title={item.explanation}><div className="flex items-start justify-between gap-2"><span>{item.name}</span><strong className="whitespace-nowrap tabular-nums">−{money(Number(item.amount))}</strong></div><div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span>{item.kind === "manual" ? "Manual" : item.kind === "coupon" ? "Coupon" : "Automatic"} · {item.type}</span>{item.kind === "manual" && <span>{pricing.approval_required ? pricing.approval_status === "approved" ? "Approved" : "Pending approval" : "Within authority"}</span>}{item.kind === "manual" && canApply && <Button size="sm" variant="ghost" onClick={onRemoveManual}>Remove</Button>}{item.kind === "coupon" && <Button size="sm" variant="ghost" onClick={() => onCoupon("")}>Remove</Button>}</div></li>)}</ul></details>}
    {coupon && !pricing?.applied.some(item => item.kind === "coupon") && <div className="flex items-center justify-between gap-2 text-sm"><span>Coupon: {coupon}</span><Button size="sm" variant="ghost" onClick={() => onCoupon("")}>Remove</Button></div>}
    {(error || pricing?.blocked || !!pricing?.coupon_errors?.length) && <p role="alert" className="text-sm">{error || pricing?.blocked || pricing?.coupon_errors?.[0]}</p>}
    {(pricing?.approval_required || approvalId) && pricing?.approval_status !== "approved" && <div className="space-y-2 rounded-lg border border-border p-3"><p className="text-sm font-medium">{settings.approvals ? "Pending approval" : "Discount exceeds authority"}</p><p className="text-xs text-muted">{settings.approvals ? "Checkout validates the manager’s approval against this exact cart." : "Approvals are disabled. Reduce or remove the manual discount."}</p>{settings.approvals && <><form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); onApprovalId(String(new FormData(event.currentTarget).get("approval")).trim() || undefined); }}><Field label="Approved request reference"><Input name="approval" defaultValue={approvalId ?? ""} required /></Field><Button type="submit" size="sm" variant="secondary">Check approval</Button></form>{approvalId && <Button size="sm" variant="ghost" onClick={() => onApprovalId(undefined)}>Clear approval reference</Button>}{canApply && <Button size="sm" variant="secondary" onClick={onRequestApproval} disabled={requesting}>Request approval</Button>}</>}</div>}
    {pricing?.approval_status === "approved" && <p role="status" className="text-xs text-accent">Discount approved for this cart.</p>}
    {open && <Drawer open onClose={() => setOpen(false)} side="center" size="sm" title="Apply discount"><form className="space-y-4 p-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onManual({ kind: data.get("kind") as "percent" | "fixed", value: Number(data.get("value")), reason: String(data.get("reason")), scope: String(data.get("scope")) }); setOpen(false); }}><Field label="Discount type"><Select name="kind" defaultValue={draftKind} onChange={event => setDraftKind(event.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field><Field label="Value" required><Input name="value" type="number" min="0.01" max={draftKind === "percent" ? 100 : undefined} step="0.01" required /></Field><Field label="Apply to"><Select name="scope"><option value="sale">Entire sale</option>{cart.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Reason" required><Input name="reason" required minLength={5} maxLength={500} /></Field><p className="text-xs text-muted">The server checks authority limits, promotion rules and the unit-cost floor.</p><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Apply</Button></div></form></Drawer>}
  </section>;
}
