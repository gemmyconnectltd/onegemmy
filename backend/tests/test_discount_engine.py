"""The discount pricing engine, on its own: every one of the ten types, stacking, caps, rounding, usage, approval and the fingerprint an approval is bound to."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal as D

from app.modules.discounts.engine import Context, Line, Rule, money, price_cart

NOW = datetime(2026, 11, 8, 10, 0, tzinfo=UTC)


def ln(ref, price, qty, product=None, category=None, cost=None):
    return Line(
        ref,
        D(str(price)),
        D(str(qty)),
        product_id=product or ref,
        category_id=category,
        cost=D(str(cost)) if cost is not None else None,
    )


def rule(rid, type_="percentage", value=10, kind="percent", **kw):
    config = kw.pop("config", {})
    return Rule(
        id=rid,
        name=kw.pop("name", rid),
        type=type_,
        value_kind=kind,
        value=D(str(value)),
        config=config,
        **kw,
    )


def ctx(**kw):
    return Context(now=kw.pop("now", NOW), **kw)


def run(lines, rules, **kw):
    return price_cart(lines, rules, ctx(**kw))


def test_percentage_with_a_maximum_never_goes_past_it():
    r = run([ln("a", 1000, 2)], [rule("p", value=10)])
    assert (
        r.total_discount == D("200.00")
        and r.net_subtotal == D("1800.00")
        and r.subtotal == D("2000.00")
    )
    capped = run([ln("a", 1000, 2)], [rule("p", value=10, max_discount=D(150))])
    assert capped.total_discount == D("150.00")


def test_fixed_amount_is_taken_once_spread_by_value_and_never_below_zero():
    r = run([ln("a", 6000, 1), ln("b", 14000, 1)], [rule("f", "fixed", 5000, "fixed")])
    assert r.total_discount == D("5000.00") and {x["ref"]: x["discount"] for x in r.lines} == {
        "a": "1500.00",
        "b": "3500.00",
    }
    small = run([ln("a", 3000, 1)], [rule("f", "fixed", 5000, "fixed")])
    assert small.total_discount == D("3000.00") and small.net_subtotal == D(
        "0.00"
    )  # a total never goes negative
    per_unit = run(
        [ln("a", 1000, 3)], [rule("f", "fixed", 100, "fixed", config={"per_unit": True})]
    )
    assert per_unit.total_discount == D("300.00")


def test_product_and_category_scopes_include_and_exclude():
    lines = [
        ln("phone", 500, 1, category="elec"),
        ln("cable", 20, 1, category="elec"),
        ln("shirt", 50, 1, category="wear"),
    ]
    only_phone = run(
        lines, [rule("p", "product", 15, config={"scope": {"product_ids": ["phone"]}})]
    )
    assert only_phone.total_discount == D("75.00")
    cat = run(
        lines,
        [
            rule(
                "c",
                "category",
                10,
                config={"scope": {"category_ids": ["elec"], "exclude_product_ids": ["cable"]}},
            )
        ],
    )
    assert cat.total_discount == D("50.00") and [x["discount"] for x in cat.lines] == [
        "50.00",
        "0.00",
        "0.00",
    ]


def test_customer_discount_uses_real_customer_fields():
    r = rule("w", "customer", 5, config={"scope": {"customer_types": ["business"]}})
    assert run(
        [ln("a", 100, 1)], [r], customer_type="business", customer_id="c1"
    ).total_discount == D("5.00")
    no = run([ln("a", 100, 1)], [r], customer_type="individual", customer_id="c2")
    assert no.total_discount == 0 and "not eligible" in no.rejected[0]["reason"]
    empty = run([ln("a", 100, 1)], [rule("e", "customer", 5)])
    assert empty.total_discount == 0
    named = rule("n", "customer", 5, config={"scope": {"customer_ids": ["c9"]}})
    assert run([ln("a", 100, 1)], [named], customer_id="c9").total_discount == D("5.00")


def test_volume_discount_uses_the_highest_threshold_for_all_units():
    r = rule(
        "v",
        "volume",
        0,
        config={"thresholds": [{"min_qty": 5, "value": 3}, {"min_qty": 10, "value": 8}]},
    )
    assert run([ln("a", 100, 4)], [r]).total_discount == 0
    assert run([ln("a", 100, 5)], [r]).total_discount == D("15.00")
    assert run([ln("a", 100, 12)], [r]).total_discount == D("96.00")  # 8% of all 12 units


def test_buy_x_get_y_rewards_the_cheapest_qualifying_units():
    same = rule("b", "bogo", 0, config={"buy": {"qty": 2}, "get": {"qty": 1, "percent": 100}})
    assert run([ln("a", 100, 3)], [same]).total_discount == D("100.00")  # buy 2 get 1 free
    assert run([ln("a", 100, 5)], [same]).total_discount == D("100.00")  # one complete set only
    assert run([ln("a", 100, 6)], [same]).total_discount == D("200.00")
    half = rule("h", "bogo", 0, config={"buy": {"qty": 3}, "get": {"qty": 1, "percent": 50}})
    assert run([ln("a", 80, 4)], [half]).total_discount == D("40.00")  # the fourth at half price
    cross = rule(
        "x",
        "bogo",
        0,
        config={
            "buy": {"qty": 2, "product_ids": ["a"]},
            "get": {"qty": 1, "percent": 100, "product_ids": ["b"]},
        },
    )
    r = run([ln("a", 100, 2), ln("b", 30, 1)], [cross])
    assert (
        r.total_discount == D("30.00") and r.lines[1]["net"] == "0.00" and r.lines[1]["qty"] == "1"
    )  # the free item is still a line, so stock leaves
    assert run([ln("a", 100, 1), ln("b", 30, 1)], [cross]).total_discount == 0
    capped = rule("m", "bogo", 0, config={"buy": {"qty": 1}, "get": {"qty": 1}, "max_per_sale": 1})
    assert run([ln("a", 10, 8)], [capped]).total_discount == D("10.00")


def test_coupon_applies_only_with_a_valid_code():
    r = rule("c", "coupon", 10)
    assert run([ln("a", 100, 1)], [r]).total_discount == 0
    with_code = run([ln("a", 100, 1)], [r], valid_coupons={"c": "PESAA10"})
    assert (
        with_code.total_discount == D("10.00")
        and with_code.coupon_total == D("10.00")
        and with_code.applied[0].coupon_code == "PESAA10"
    )
    off = run([ln("a", 100, 1)], [r], valid_coupons={"c": "PESAA10"}, coupons_enabled=False)
    assert off.total_discount == 0


def test_order_level_discount_has_a_minimum_a_maximum_and_allocates_to_lines():
    r = rule("o", "order", 5, config={"conditions": {"min_order_amount": 1000}}, max_discount=D(60))
    assert run([ln("a", 500, 1)], [r]).total_discount == 0
    big = run([ln("a", 900, 1), ln("b", 300, 1)], [r])
    assert (
        big.total_discount == D("60.00")
        and sum(D(x["discount"]) for x in big.lines) == D("60.00")
        and D(big.lines[0]["discount"]) == D("45.00")
    )


def test_tiered_highest_band_and_progressive_are_different_and_explicit():
    bands = [{"from": 5, "value": 3}, {"from": 10, "value": 5}, {"from": 20, "value": 10}]
    highest = run([ln("a", 100, 12)], [rule("t", "tiered", 0, config={"tiers": bands})])
    assert highest.total_discount == D("60.00")  # 5% of all 12
    progressive = run(
        [ln("a", 100, 12)], [rule("t", "tiered", 0, config={"tiers": bands, "mode": "progressive"})]
    )
    assert progressive.total_discount == D("30.00")  # 5 units at 3% + 3 units at 5%... = 15 + 15
    by_amount = run(
        [ln("a", 100, 12)],
        [rule("t", "tiered", 0, config={"basis": "amount", "tiers": [{"from": 1000, "value": 4}]})],
    )
    assert by_amount.total_discount == D("48.00")


def test_priority_stacking_non_combinable_and_exclusive():
    lines = [ln("a", 1000, 1)]
    stack = run(lines, [rule("one", value=10, priority=2), rule("two", value=10, priority=1)])
    assert stack.total_discount == D(
        "200.00"
    )  # each percentage is of the original price and they add up
    solo = run(
        lines,
        [rule("one", value=10, priority=2, combinable=False), rule("two", value=5, priority=1)],
    )
    assert [a.rule_id for a in solo.applied] == ["one"] and solo.total_discount == D("100.00")
    exclusive = run(
        lines, [rule("ex", value=30, exclusive=True), rule("a", value=10), rule("b", value=10)]
    )
    assert [a.rule_id for a in exclusive.applied] == ["ex"] and exclusive.total_discount == D(
        "300.00"
    )
    weaker = run(
        lines, [rule("ex", value=5, exclusive=True), rule("a", value=10), rule("b", value=10)]
    )
    assert {a.rule_id for a in weaker.applied} == {"a", "b"} and any(
        "Exclusive" in x["reason"] for x in weaker.rejected
    )
    capped = run(lines, [rule("a", value=40), rule("b", value=40), rule("c", value=40)])
    assert capped.net_subtotal >= 0 and capped.total_discount <= D("1000.00")
    combined = run(
        lines,
        [
            rule("a", value=40, max_combined_pct=D(50)),
            rule("b", value=40, max_combined_pct=D(50)),
        ],
    )
    assert combined.total_discount == D("500.00")


def test_schedule_branch_channel_time_window_and_usage_limits():
    lines = [ln("a", 100, 1)]
    future = rule("f", value=10, starts_at=NOW + timedelta(days=1))
    past = rule("p", value=10, ends_at=NOW - timedelta(seconds=1))
    assert run(lines, [future, past]).total_discount == 0 and {
        x["reason"] for x in run(lines, [future, past]).rejected
    } == {"Has not started yet", "Has ended"}
    branch = rule("b", value=10, config={"scope": {"branch_ids": ["br1"], "channels": ["pos"]}})
    assert run(lines, [branch], branch_id="br1").total_discount == D("10.00")
    assert run(lines, [branch], branch_id="br2").total_discount == 0
    assert run(lines, [branch], branch_id="br1", channel="quotation").total_discount == 0
    morning = rule("m", value=10, config={"time_window": {"start": "08:00", "end": "11:00"}})
    assert run(lines, [morning]).total_discount == D("10.00")
    assert run(lines, [morning], now=NOW.replace(hour=15)).total_discount == 0
    limited = rule(
        "u", value=10, config={"conditions": {"usage_limit": 5, "per_customer_limit": 1}}
    )
    assert run(lines, [limited], usage={"u": (5, 0)}, customer_id="c").total_discount == 0
    assert run(lines, [limited], usage={"u": (2, 1)}, customer_id="c").total_discount == 0
    assert run(lines, [limited], usage={"u": (2, 0)}, customer_id="c").total_discount == D("10.00")


def test_minimum_margin_floor_and_minimums():
    floor = rule("m", value=50, config={"conditions": {"min_margin_percent": 20}})
    r = run([ln("a", 100, 1, cost=70)], [floor])
    assert r.total_discount == D("12.50")  # net must stay at 70 / (1 - 0.20) = 87.50
    assert (
        run(
            [ln("a", 100, 1)], [rule("q", value=10, config={"conditions": {"min_quantity": 3}})]
        ).total_discount
        == 0
    )


def test_switches_turn_automatic_and_advanced_types_off():
    assert run([ln("a", 100, 1)], [rule("p", value=10)], automatic=False).total_discount == 0
    adv = rule("v", "volume", 0, config={"thresholds": [{"min_qty": 1, "value": 10}]})
    assert run([ln("a", 100, 1)], [adv], advanced=False).total_discount == 0
    assert run([ln("a", 100, 1)], [rule("p", value=10)], advanced=False).total_discount == D(
        "10.00"
    )


def test_manual_discount_follows_the_persons_authority_and_the_switch():
    lines = [ln("a", 1000, 1)]
    off = run(lines, [], manual={"kind": "percent", "value": D(5)}, manual_allowed=False)
    assert off.total_discount == 0 and off.blocked
    within = run(
        lines,
        [],
        manual={"kind": "percent", "value": D(5)},
        manual_allowed=True,
        authority_percent=D(5),
    )
    assert within.total_discount == D("50.00") and not within.approval_required
    over = run(
        lines,
        [],
        manual={"kind": "percent", "value": D(12)},
        manual_allowed=True,
        authority_percent=D(5),
    )
    assert (
        over.approval_required
        and "more than your limit" in over.approval_reasons[0]
        and over.manual_percent == D("12.00")
    )
    owner = run(
        lines,
        [],
        manual={"kind": "fixed", "value": D(300)},
        manual_allowed=True,
        authority_percent=None,
    )
    assert owner.total_discount == D("300.00") and not owner.approval_required
    typed = run(
        lines, [], legacy_manual_lines={"a": D(40)}, manual_allowed=True, authority_percent=D(5)
    )
    assert typed.manual_total == D("40.00") and not typed.approval_required
    after_auto = run(
        lines,
        [rule("p", value=10)],
        manual={"kind": "fixed", "value": D(2000)},
        manual_allowed=True,
    )
    assert after_auto.net_subtotal == D("0.00") and after_auto.total_discount == D(
        "1000.00"
    )  # never below zero


def test_cents_always_add_up_and_the_fingerprint_follows_the_sale():
    lines = [ln("a", "33.33", 1), ln("b", "33.33", 1), ln("c", "33.34", 1)]
    r = run(lines, [rule("f", "fixed", 10, "fixed")])
    assert sum(D(x["discount"]) for x in r.lines) == D("10.00") and r.total_discount == D("10.00")
    base = run(
        [ln("a", 100, 1)], [], manual={"kind": "percent", "value": D(10)}, manual_allowed=True
    )
    same = run(
        [ln("a", 100, 1)], [], manual={"kind": "percent", "value": D(10)}, manual_allowed=True
    )
    changed_qty = run(
        [ln("a", 100, 2)], [], manual={"kind": "percent", "value": D(10)}, manual_allowed=True
    )
    changed_manual = run(
        [ln("a", 100, 1)], [], manual={"kind": "percent", "value": D(11)}, manual_allowed=True
    )
    assert (
        base.context_hash == same.context_hash != changed_qty.context_hash
        and base.context_hash != changed_manual.context_hash
    )
    assert money("2.675") == D("2.68")


def test_the_result_explains_what_was_applied_and_what_was_not():
    r = run(
        [ln("a", 100, 1)],
        [
            rule("p", value=10, name="Ten off"),
            rule("late", value=5, starts_at=NOW + timedelta(days=2), name="Later"),
        ],
    )
    dumped = r.dump()
    assert (
        dumped["applied"][0]["name"] == "Ten off"
        and "10% off" in dumped["applied"][0]["explanation"]
    )
    assert (
        dumped["rejected"][0]["name"] == "Later"
        and dumped["total_discount"] == "10.00"
        and dumped["net_subtotal"] == "90.00"
    )


def test_approval_fingerprint_includes_branch_channel_variant_and_cost():
    line = ln("a", 100, 1, cost=50)
    base = run([line], [], branch_id="one")
    assert base.context_hash != run([line], [], branch_id="two").context_hash
    assert base.context_hash != run([line], [], branch_id="one", channel="quotation").context_hash
    line.variant_id = "variant"
    assert base.context_hash != run([line], [], branch_id="one").context_hash


def test_manual_line_discount_stays_on_its_own_returnable_line():
    result = run(
        [ln("a", 100, 1), ln("b", 100, 1)],
        [],
        legacy_manual_lines={"a": D(30)},
        manual_allowed=True,
    )
    assert [D(x["discount"]) for x in result.lines] == [D(30), D(0)]


def test_combined_limit_applies_to_later_rules_without_their_own_cap():
    result = run(
        [ln("a", 100, 1)],
        [rule("a", value=40, priority=2, max_combined_pct=D(50)), rule("b", value=40, priority=1)],
        manual_allowed=True,
        manual={"kind": "fixed", "value": D(10)},
    )
    assert result.total_discount == D(50)


def test_bogo_uses_product_scope_when_buy_and_get_omit_their_own_targets():
    r = rule(
        "b",
        "bogo",
        0,
        config={"scope": {"product_ids": ["a"]}, "buy": {"qty": 2}, "get": {"qty": 1}},
    )
    assert run([ln("a", 100, 2), ln("b", 100, 1)], [r]).total_discount == 0


def test_progressive_tiers_do_not_allocate_memory_per_unit():
    result = run(
        [ln("a", 1, 100000000)],
        [
            rule(
                "t",
                "tiered",
                0,
                config={"mode": "progressive", "tiers": [{"from": 1, "value": 10}]},
            )
        ],
    )
    assert result.total_discount == D("10000000.00")


def test_volume_tiers_can_count_separate_products_instead_of_combining_quantities():
    cfg = {"quantity_scope": "per_product", "tiers": [{"from": 5, "value": 10}]}
    assert (
        run([ln("a", 100, 3), ln("b", 100, 3)], [rule("v", "volume", 0, config=cfg)]).total_discount
        == 0
    )
    assert run(
        [ln("a", 100, 5), ln("b", 100, 3)], [rule("v", "volume", 0, config=cfg)]
    ).total_discount == D(50)


def test_exclusive_compares_with_the_discounts_that_can_actually_stack():
    result = run([ln('a', 100, 1)], [rule('exclusive', value=30, exclusive=True),
        rule('solo', value=20, combinable=False, priority=10), rule('blocked', value=20, priority=1)])
    assert result.total_discount == D(30)
    assert [r.rule_id for r in result.applied] == ['exclusive']


def test_manual_discount_cannot_bypass_an_applied_rules_margin_floor():
    result = run([ln('a', 100, 1, cost=70)], [rule('floor', value=5, config={'conditions': {'min_margin_percent': 20}})], manual_allowed=True, manual={'kind': 'fixed', 'value': D(50)})
    assert result.net_subtotal == D('87.50')


def test_equal_numbers_fingerprint_identically_however_they_are_written():
    from datetime import UTC, datetime
    from decimal import Decimal

    from app.modules.discounts.engine import Context, Line, price_cart
    from app.modules.discounts.service import pricing_hash

    def priced(price, qty):
        return price_cart([Line("0", Decimal(price), Decimal(qty))], [], Context(now=datetime.now(UTC)))

    a, b = priced("100", "1"), priced("100.0", "1.0")
    assert a.context_hash == b.context_hash
    assert pricing_hash(a) == pricing_hash(b)
