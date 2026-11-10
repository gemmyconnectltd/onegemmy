"""The one pricing engine for discounts and promotions.

Pure and synchronous: it is given the cart, the rules that are on file, who is buying and what has been looked up (coupons, past usage), and returns
what every line costs after discounts, why, and whether anyone has to approve it. It never reads the database and never trusts an amount that came
from a screen. Money is Decimal throughout and always rounded to cents with half-up rounding.

The ten business-facing types share three things: an eligibility test (when, where, who, how much), a reward (percent, fixed, quantity band, buy X get Y)
and the stacking rules. They are not ten calculation systems.

Stated plainly, so nothing is ambiguous:
- Prices are what the cart says (VAT-inclusive in Pesaa). A discount lowers the amount the customer pays; tax is taken out of the discounted total by the caller.
- A fixed amount is taken off ONCE per sale from the eligible items (spread by value), unless the rule says `per_unit`.
- A volume discount (one threshold ladder) and a tiered discount both use the HIGHEST band reached, applied to ALL eligible units, unless a tiered rule says
  `mode: "progressive"`, in which case each band's units get that band's rate.
- Buy X get Y: the reward units are the cheapest eligible units; they are sold at the reward percent off (100 = free) and still leave stock, as ordinary lines.
- Percentages are of the ORIGINAL price and add up (two 10% rules give 20%, not 19%), never past what is left on the line.
- Rules are applied in priority order (highest first). An exclusive rule applies alone, and wins only when it gives the customer at least as much as the others combined.
  A rule that does not combine skips any line that already carries a discount. No line is ever discounted below zero, nor below the rule's margin floor.
- A manual discount is applied after the automatic ones, spread over what is left. It needs approval when it exceeds the person's authority.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, replace
from datetime import datetime, time
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal(0)
HUNDRED = Decimal(100)

TYPES = (
    "percentage",
    "fixed",
    "product",
    "category",
    "customer",
    "volume",
    "bogo",
    "coupon",
    "order",
    "tiered",
)
# Types that need the "advanced discount types" switch.
ADVANCED = frozenset({"category", "customer", "volume", "bogo", "tiered"})
KINDS = ("automatic", "coupon", "manual")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def _n(value) -> str:
    return format(D(value).normalize(), "f")


def D(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value if value is not None else 0))


def _canonical(value: Decimal) -> Decimal:
    return Decimal(format(value.normalize(), "f")) if value.is_finite() else value


@dataclass
class Line:
    ref: str
    unit_price: Decimal
    qty: Decimal
    product_id: str | None = None
    category_id: str | None = None
    cost: Decimal | None = None  # unit cost, for the margin floor

    variant_id: str | None = None

    def __post_init__(self) -> None:
        # 100, 100.0 and 1E+2 are the same price: one spelling, so the cart preview and the checkout fingerprint identically.
        self.unit_price = _canonical(self.unit_price)
        self.qty = _canonical(self.qty)
        if self.cost is not None:
            self.cost = _canonical(self.cost)

    @property
    def gross(self) -> Decimal:
        return money(self.unit_price * self.qty)


@dataclass
class Rule:
    id: str
    name: str
    type: str
    value_kind: str = "percent"  # percent | fixed
    value: Decimal = ZERO
    max_discount: Decimal | None = None
    priority: int = 100
    combinable: bool = True
    exclusive: bool = False
    max_combined_pct: Decimal | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    config: dict = field(default_factory=dict)
    campaign_id: str | None = None
    campaign_name: str | None = None


@dataclass
class Context:
    now: datetime  # timezone-aware, already in the business's own zone
    branch_id: str | None = None
    channel: str = "pos"
    customer_id: str | None = None
    customer_type: str | None = None
    valid_coupons: dict[str, str] = field(
        default_factory=dict
    )  # rule id -> coupon code that is valid for this sale
    usage: dict[str, tuple[int, int]] = field(
        default_factory=dict
    )  # rule id -> (times used in total, times this customer used it)
    automatic: bool = True  # the business has automatic discounts on
    manual: dict | None = None  # {"kind": "percent"|"fixed", "value": Decimal, "reason": str}
    manual_allowed: bool = False
    legacy_manual_lines: dict[str, Decimal] = field(
        default_factory=dict
    )  # per-line amounts typed at the till
    authority_percent: Decimal | None = (
        None  # the most this person may give by hand; None = unlimited
    )
    advanced: bool = True
    coupons_enabled: bool = True


def _in(values, item) -> bool:
    return item is not None and str(item) in {str(v) for v in values or []}


def _scope_lines(rule: Rule, lines: list[Line]) -> list[Line]:
    scope = rule.config.get("scope") or {}
    products, categories = scope.get("product_ids") or [], scope.get("category_ids") or []
    out = []
    for ln in lines:
        if _in(scope.get("exclude_product_ids"), ln.product_id) or _in(
            scope.get("exclude_category_ids"), ln.category_id
        ):
            continue
        if (products or categories) and not (
            _in(products, ln.product_id) or _in(categories, ln.category_id)
        ):
            continue
        if scope.get("variant_ids") and not _in(scope["variant_ids"], ln.variant_id):
            continue
        out.append(ln)
    return out


def eligibility(rule: Rule, lines: list[Line], ctx: Context, subtotal: Decimal) -> str | None:
    """None when the rule may apply to this sale, otherwise the reason it does not."""
    if rule.type in ADVANCED and not ctx.advanced:
        return "Advanced discount types are switched off"
    if rule.type == "coupon":
        if not ctx.coupons_enabled:
            return "Coupons are switched off"
        if rule.id not in ctx.valid_coupons:
            return "Needs a valid coupon code"
    elif not ctx.automatic:
        return "Automatic discounts are switched off"
    if rule.starts_at and ctx.now < rule.starts_at:
        return "Has not started yet"
    if rule.ends_at and ctx.now >= rule.ends_at:
        return "Has ended"
    cfg, scope, cond = (
        rule.config,
        rule.config.get("scope") or {},
        rule.config.get("conditions") or {},
    )
    window = cfg.get("time_window") or {}
    if window.get("start") and window.get("end"):
        start, end = time.fromisoformat(window["start"]), time.fromisoformat(window["end"])
        now_t = ctx.now.timetz().replace(tzinfo=None)
        if not (start <= now_t < end if start <= end else (now_t >= start or now_t < end)):
            return "Outside its daily time window"
    if scope.get("branch_ids") and not _in(scope["branch_ids"], ctx.branch_id):
        return "Not offered at this branch"
    if scope.get("channels") and ctx.channel not in scope["channels"]:
        return "Not offered on this sales channel"
    if (scope.get("customer_ids") or scope.get("customer_types")) and not (
        _in(scope.get("customer_ids"), ctx.customer_id)
        or (ctx.customer_type and ctx.customer_type in (scope.get("customer_types") or []))
    ):
        return "This customer is not eligible"
    if rule.type == "customer" and not (scope.get("customer_ids") or scope.get("customer_types")):
        return "Names no customers"
    if cond.get("min_order_amount") and subtotal < D(cond["min_order_amount"]):
        return f"Needs an order of at least {cond['min_order_amount']}"
    eligible = _scope_lines(rule, lines)
    if not eligible:
        return "None of the items qualify"
    units = sum((ln.qty for ln in eligible), ZERO)
    if cond.get("min_quantity") and units < D(cond["min_quantity"]):
        return f"Needs at least {cond['min_quantity']} qualifying units"
    used_total, used_customer = ctx.usage.get(rule.id, (0, 0))
    if cond.get("usage_limit") is not None and used_total >= int(cond["usage_limit"]):
        return "Its usage limit has been reached"
    if cond.get("per_customer_limit") is not None and not ctx.customer_id:
        return "Choose a customer for this limited discount"
    if (
        cond.get("per_customer_limit") is not None
        and ctx.customer_id
        and used_customer >= int(cond["per_customer_limit"])
    ):
        return "This customer has used it the most times allowed"
    return None


def _spread(total: Decimal, lines: list[Line], weights: dict[str, Decimal]) -> dict[str, Decimal]:
    """Share an amount across lines in proportion to their weights; the cents add up exactly (largest remainder)."""
    total = money(total)
    weight_sum = sum(weights.values(), ZERO)
    if total <= 0 or weight_sum <= 0:
        return {ln.ref: ZERO for ln in lines}
    raw = {ref: total * w / weight_sum for ref, w in weights.items()}
    floor = {
        ref: (v * 100).to_integral_value(rounding="ROUND_FLOOR") / 100 for ref, v in raw.items()
    }
    left = int(((total - sum(floor.values(), ZERO)) * 100).to_integral_value())
    for ref in sorted(raw, key=lambda r: raw[r] - floor[r], reverse=True)[: max(left, 0)]:
        floor[ref] += CENT
    return {ref: money(floor.get(ref, ZERO)) for ref in (ln.ref for ln in lines)}


def _percent(rule: Rule) -> Decimal:
    return D(rule.value) / HUNDRED


def _reward(rule: Rule, lines: list[Line], ctx: Context) -> tuple[dict[str, Decimal], str]:
    """What the rule would take off each line, before caps and stacking, and a plain-words explanation."""
    eligible = _scope_lines(rule, lines)
    cfg = rule.config
    gross = {ln.ref: ln.gross for ln in eligible}
    gross_sum = sum(gross.values(), ZERO)
    units = sum((ln.qty for ln in eligible), ZERO)
    out: dict[str, Decimal] = {ln.ref: ZERO for ln in lines}

    if rule.type == "bogo":
        buy, get = cfg.get("buy") or {}, cfg.get("get") or {}
        buy_qty, get_qty = int(buy.get("qty", 1)), int(get.get("qty", 1))
        reward_percent = D(get.get("percent", 100)) / HUNDRED
        buy_pool = _pool(lines, buy, rule)
        get_pool = (
            _pool(lines, get, rule)
            if (get.get("product_ids") or get.get("category_ids"))
            else buy_pool
        )
        buy_refs, get_refs = {ln.ref for ln in buy_pool}, {ln.ref for ln in get_pool}
        same = buy_refs == get_refs
        if not same and buy_refs & get_refs:
            return out, "Overlapping buy/reward pools require identical or disjoint scopes"
        buy_units = int(sum((ln.qty for ln in buy_pool), ZERO))
        get_units = int(sum((ln.qty for ln in get_pool), ZERO))
        sets = (
            buy_units // (buy_qty + get_qty)
            if same
            else min(buy_units // max(buy_qty, 1), get_units // max(get_qty, 1))
        )
        if cfg.get("max_per_sale"):
            sets = min(sets, int(cfg["max_per_sale"]))
        free_units = sets * get_qty
        # reward the cheapest units of the reward pool
        ladder = sorted(
            ((ln.unit_price, ln.ref, int(ln.qty)) for ln in get_pool), key=lambda t: (t[0], t[1])
        )
        for price, ref, qty in ladder:
            take = min(qty, free_units)
            if take > 0:
                out[ref] += money(price * take * reward_percent)
                free_units -= take
        total = sum(out.values(), ZERO)
        return (
            out,
            f"Buy {buy_qty}, get {get_qty} at {int(reward_percent * 100)}% off ({sets} time{'s' if sets != 1 else ''}): {money(total)} off",
        )

    if rule.type in ("volume", "tiered"):
        if cfg.get("quantity_scope") == "per_product":
            groups: dict[str, list[Line]] = {}
            for ln in eligible:
                groups.setdefault(ln.product_id or ln.ref, []).append(ln)
            combined = {ln.ref: ZERO for ln in lines}
            for group in groups.values():
                partial, _ = _reward(
                    replace(rule, config={**cfg, "quantity_scope": "combined"}), group, ctx
                )
                combined.update(partial)
            return combined, "Quantity tiers evaluated separately for each product"
        basis = cfg.get("basis", "quantity")
        measure = gross_sum if basis == "amount" else units
        bands = sorted(
            (
                (D(b.get("from", b.get("min_qty", 0))), D(b["value"]))
                for b in (cfg.get("tiers") or cfg.get("thresholds") or [])
            ),
            key=lambda b: b[0],
        )
        reached = [b for b in bands if measure >= b[0]]
        if not reached:
            return out, "No quantity band reached"
        if rule.type == "tiered" and cfg.get("mode") == "progressive" and basis == "quantity":
            # each band's units get that band's rate: units in [from, next from)
            cursor = ZERO
            for ln in eligible:
                line_end = cursor + ln.qty
                reward = ZERO
                for i, (start, rate) in enumerate(bands):
                    band_start = max(start - 1, ZERO)
                    band_end = max(bands[i + 1][0] - 1, ZERO) if i + 1 < len(bands) else line_end
                    overlap = max(min(line_end, band_end) - max(cursor, band_start), ZERO)
                    reward += ln.unit_price * overlap * rate / HUNDRED
                out[ln.ref] = money(reward)
                cursor = line_end
            return out, "Progressive tiers: each band's units get that band's rate"
        rate = reached[-1][1] / HUNDRED
        for ln in eligible:
            out[ln.ref] = money(ln.gross * rate)
        return (
            out,
            f"{_n(reached[-1][1])}% off for {'an order of' if basis == 'amount' else 'buying'} {_n(measure)}{'' if basis == 'amount' else ' units'}",
        )

    if rule.value_kind == "fixed":
        if cfg.get("per_unit"):
            for ln in eligible:
                out[ln.ref] = money(min(D(rule.value) * ln.qty, ln.gross))
            return out, f"{money(rule.value)} off each unit"
        spread = _spread(min(D(rule.value), gross_sum), eligible, gross)
        out.update(spread)
        return out, f"{money(rule.value)} off the qualifying items"

    rate = _percent(rule)
    for ln in eligible:
        out[ln.ref] = money(ln.gross * rate)
    return out, f"{_n(rule.value)}% off the qualifying items"


def _pool(lines: list[Line], spec: dict, rule: Rule) -> list[Line]:
    products, categories = spec.get("product_ids") or [], spec.get("category_ids") or []
    scope = rule.config.get("scope") or {}
    out = []
    for ln in lines if products or categories else _scope_lines(rule, lines):
        if _in(scope.get("exclude_product_ids"), ln.product_id) or _in(
            scope.get("exclude_category_ids"), ln.category_id
        ):
            continue
        if (products or categories) and not (
            _in(products, ln.product_id) or _in(categories, ln.category_id)
        ):
            continue
        out.append(ln)
    return out


@dataclass
class AppliedRule:
    rule_id: str | None
    name: str
    type: str
    kind: str
    amount: Decimal
    lines: dict[str, Decimal]
    explanation: str
    coupon_code: str | None = None
    campaign_id: str | None = None
    campaign_name: str | None = None

    def dump(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "name": self.name,
            "type": self.type,
            "kind": self.kind,
            "amount": str(self.amount),
            "lines": {k: str(v) for k, v in self.lines.items() if v},
            "explanation": self.explanation,
            "coupon_code": self.coupon_code,
            "campaign_id": self.campaign_id,
            "campaign_name": self.campaign_name,
        }


@dataclass
class Result:
    subtotal: Decimal
    lines: list[dict]
    applied: list[AppliedRule]
    rejected: list[dict]
    automatic_total: Decimal
    coupon_total: Decimal
    manual_total: Decimal
    total_discount: Decimal
    net_subtotal: Decimal
    approval_required: bool
    approval_reasons: list[str]
    blocked: str | None
    manual_percent: Decimal
    context_hash: str

    def dump(self) -> dict:
        return {
            "subtotal": str(self.subtotal),
            "lines": self.lines,
            "applied": [a.dump() for a in self.applied],
            "rejected": self.rejected,
            "automatic_total": str(self.automatic_total),
            "coupon_total": str(self.coupon_total),
            "manual_total": str(self.manual_total),
            "total_discount": str(self.total_discount),
            "net_subtotal": str(self.net_subtotal),
            "approval_required": self.approval_required,
            "approval_reasons": self.approval_reasons,
            "blocked": self.blocked,
            "manual_percent": str(self.manual_percent),
            "context_hash": self.context_hash,
        }


def context_hash(lines: list[Line], ctx: Context) -> str:
    """Fingerprint of everything an approval is for: the items, the customer, the coupons and the discount asked for. A change to any of them is a different sale."""
    manual = ctx.manual or {}
    body = {
        "branch": ctx.branch_id,
        "channel": ctx.channel,
        "lines": sorted(
            [
                ln.product_id or "",
                ln.variant_id or "",
                str(ln.unit_price),
                str(ln.qty),
                str(ln.cost),
            ]
            for ln in lines
        ),
        "customer": ctx.customer_id,
        "coupons": sorted(ctx.valid_coupons.values()),
        "manual": [
            manual.get("kind"),
            str(manual.get("value", "")),
            str(sorted((k, str(v)) for k, v in ctx.legacy_manual_lines.items())),
        ],
    }
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


def price_cart(lines: list[Line], rules: list[Rule], ctx: Context) -> Result:
    if len({ln.ref for ln in lines}) != len(lines):
        raise ValueError("Line references must be unique")
    if any(
        not ln.unit_price.is_finite() or not ln.qty.is_finite() or ln.unit_price < 0 or ln.qty <= 0
        for ln in lines
    ):
        raise ValueError("Prices and quantities must be finite and nonnegative")
    subtotal = money(sum((ln.gross for ln in lines), ZERO))
    remaining = {ln.ref: ln.gross for ln in lines}
    by_ref = {ln.ref: ln for ln in lines}
    line_rules: dict[str, list[dict]] = {ln.ref: [] for ln in lines}
    rejected: list[dict] = []
    candidates: list[tuple[Rule, dict[str, Decimal], str]] = []
    for rule in sorted(rules, key=lambda r: (-r.priority, r.name)):
        why = eligibility(rule, lines, ctx, subtotal)
        if why:
            rejected.append({"rule_id": rule.id, "name": rule.name, "reason": why})
            continue
        grants, note = _reward(rule, lines, ctx)
        if sum(grants.values(), ZERO) <= 0:
            rejected.append(
                {
                    "rule_id": rule.id,
                    "name": rule.name,
                    "reason": note if note.startswith("No ") else "Gives nothing on this sale",
                }
            )
            continue
        candidates.append((rule, grants, note))

    def limited(
        rule: Rule, grants: dict[str, Decimal], applied_so_far: Decimal
    ) -> dict[str, Decimal]:
        """Caps: the rule's own maximum, its combined maximum, the margin floor, and never below zero."""
        out = {}
        for ref, amount in grants.items():
            ln = by_ref[ref]
            room = remaining[ref]
            floor_pct = D((rule.config.get("conditions") or {}).get("min_margin_percent", 0))
            if floor_pct and ln.cost is not None and floor_pct < HUNDRED:
                floor_price = money(ln.cost * ln.qty / (1 - floor_pct / HUNDRED))
                room = max(remaining[ref] - floor_price, ZERO)
            out[ref] = money(min(amount, max(room, ZERO)))
        total = sum(out.values(), ZERO)
        cap = rule.max_discount
        if rule.max_combined_pct is not None:
            cap_c = max(money(subtotal * D(rule.max_combined_pct) / HUNDRED) - applied_so_far, ZERO)
            cap = cap_c if cap is None else min(cap, cap_c)
        if cap is not None and total > D(cap):
            out = (
                _spread(D(cap), [by_ref[r] for r in out], {r: a for r, a in out.items()})
                if total
                else out
            )
        return out

    # An exclusive rule applies alone, and only when it beats everything else combined.
    exclusives = [c for c in candidates if c[0].exclusive]
    if exclusives:

        def worth(c):
            return sum(limited(c[0], c[1], ZERO).values(), ZERO)

        best = max(exclusives, key=lambda c: (worth(c), c[0].priority))
        others = price_cart(
            lines,
            [c[0] for c in candidates if not c[0].exclusive],
            replace(ctx, manual=None, legacy_manual_lines={}),
        ).total_discount
        if worth(best) >= others:
            for c in candidates:
                if c is not best:
                    rejected.append(
                        {
                            "rule_id": c[0].id,
                            "name": c[0].name,
                            "reason": f"“{best[0].name}” is exclusive and applies alone",
                        }
                    )
            candidates = [best]
        else:
            for c in exclusives:
                rejected.append(
                    {
                        "rule_id": c[0].id,
                        "name": c[0].name,
                        "reason": "Exclusive, but the other discounts together give the customer more",
                    }
                )
            candidates = [c for c in candidates if not c[0].exclusive]

    applied: list[AppliedRule] = []
    applied_total = ZERO
    touched_by_solo: set[str] = set()
    combined_limit = HUNDRED
    margin_floors = {ln.ref: ZERO for ln in lines}
    for rule, grants, note in candidates:
        proposed_limit = (
            min(combined_limit, D(rule.max_combined_pct))
            if rule.max_combined_pct is not None
            else combined_limit
        )
        usable = {
            ref: amt
            for ref, amt in grants.items()
            if amt > 0 and (rule.combinable or not line_rules[ref]) and ref not in touched_by_solo
        }
        usable = limited(rule, usable, applied_total)
        room = max(money(subtotal * proposed_limit / HUNDRED) - applied_total, ZERO)
        if sum(usable.values(), ZERO) > room:
            usable = _spread(room, [by_ref[r] for r in usable], usable)
        got = sum(usable.values(), ZERO)
        if got <= 0:
            rejected.append(
                {
                    "rule_id": rule.id,
                    "name": rule.name,
                    "reason": "Nothing left to discount on those items",
                }
            )
            continue
        combined_limit = proposed_limit
        kind = "coupon" if rule.type == "coupon" else "automatic"
        for ref, amt in usable.items():
            if amt > 0:
                remaining[ref] -= amt
                floor_pct = D((rule.config.get("conditions") or {}).get("min_margin_percent", 0))
                if floor_pct and by_ref[ref].cost is not None:
                    margin_floors[ref] = max(
                        margin_floors[ref],
                        money(by_ref[ref].cost * by_ref[ref].qty / (1 - floor_pct / HUNDRED)),
                    )
                line_rules[ref].append(
                    {"rule_id": rule.id, "name": rule.name, "amount": str(amt), "kind": kind}
                )
                if not rule.combinable:
                    touched_by_solo.add(ref)
        applied_total += got
        applied.append(
            AppliedRule(
                rule.id,
                rule.name,
                rule.type,
                kind,
                money(got),
                {r: a for r, a in usable.items() if a > 0},
                note,
                ctx.valid_coupons.get(rule.id) if kind == "coupon" else None,
                rule.campaign_id,
                rule.campaign_name,
            )
        )

    automatic_total = money(sum((a.amount for a in applied if a.kind == "automatic"), ZERO))
    coupon_total = money(sum((a.amount for a in applied if a.kind == "coupon"), ZERO))

    # Manual discount: a percent or fixed amount asked for on the sale, plus any amounts typed against single lines.
    manual_total, blocked = ZERO, None
    reasons: list[str] = []
    asked = ZERO
    if ctx.manual and D(ctx.manual.get("value", 0)) > 0:
        value = D(ctx.manual["value"])
        asked += (
            money(subtotal * value / HUNDRED)
            if ctx.manual.get("kind", "percent") == "percent"
            else money(value)
        )
    asked += sum((money(v) for v in ctx.legacy_manual_lines.values()), ZERO)
    if asked > 0:
        if not ctx.manual_allowed:
            blocked = "Manual discounts are not switched on for this business or your role"
        else:
            # Typed line discounts stay on their own lines, preserving refund allocation.
            manual_room = {ref: max(remaining[ref] - margin_floors[ref], ZERO) for ref in remaining}
            spread = {
                ln.ref: min(money(ctx.legacy_manual_lines.get(ln.ref, ZERO)), manual_room[ln.ref])
                for ln in lines
            }
            available = {ref: manual_room[ref] - spread[ref] for ref in remaining}
            order_asked = ZERO
            if ctx.manual:
                value = D(ctx.manual.get("value", 0))
                order_asked = (
                    money(subtotal * value / HUNDRED)
                    if ctx.manual.get("kind", "percent") == "percent"
                    else money(value)
                )
            order_spread = _spread(
                min(order_asked, sum(available.values(), ZERO)), lines, available
            )
            spread = {ref: spread[ref] + order_spread[ref] for ref in spread}
            room = max(money(subtotal * combined_limit / HUNDRED) - applied_total, ZERO)
            if sum(spread.values(), ZERO) > room:
                spread = _spread(room, lines, spread)
            for ref, amt in spread.items():
                if amt > 0:
                    remaining[ref] -= amt
                    line_rules[ref].append(
                        {
                            "rule_id": None,
                            "name": "Manual discount",
                            "amount": str(amt),
                            "kind": "manual",
                        }
                    )
            manual_total = money(sum(spread.values(), ZERO))
            if manual_total > 0:
                reason = (ctx.manual or {}).get("reason")
                applied.append(
                    AppliedRule(
                        None,
                        "Manual discount",
                        "manual",
                        "manual",
                        manual_total,
                        {r: a for r, a in spread.items() if a > 0},
                        f"{manual_total} off by hand" + (f" ({reason})" if reason else ""),
                    )
                )
    manual_percent = money(manual_total * HUNDRED / subtotal) if subtotal > 0 else ZERO
    if (
        manual_total > 0
        and ctx.authority_percent is not None
        and manual_percent > D(ctx.authority_percent)
    ):
        reasons.append(
            f"A manual discount of {manual_percent}% is more than your limit of {_n(ctx.authority_percent)}%"
        )

    net = money(sum(remaining.values(), ZERO))
    if net < 0:
        raise ValueError("a total can never be negative")
    out_lines = [
        {
            "ref": ln.ref,
            "unit_price": str(ln.unit_price),
            "qty": str(ln.qty),
            "gross": str(ln.gross),
            "discount": str(ln.gross - remaining[ln.ref]),
            "net": str(remaining[ln.ref]),
            "rules": line_rules[ln.ref],
        }
        for ln in lines
    ]
    return Result(
        subtotal,
        out_lines,
        applied,
        rejected,
        automatic_total,
        coupon_total,
        manual_total,
        money(subtotal - net),
        net,
        bool(reasons),
        reasons,
        blocked,
        manual_percent,
        context_hash(lines, ctx),
    )
