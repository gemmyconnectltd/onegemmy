"""Pesaa's full feature control: statuses, schedule, beta cohort, rollout, kill switch and action rules."""
import uuid
from datetime import UTC, datetime, timedelta

from types import SimpleNamespace
from unittest.mock import patch

from app.modules.tenants.feature_tree import PART_DEPENDENCIES, TREE, part_dependents
from app.modules.tenants.service.feature_control import (
    Control, Who, bucket, check_action, classify, daily_limit, evaluate, merge, outside_hours, request_keys,
    settings_for, to_control, upcoming,
)

T, B, U = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
WHO = Who(tenant_id=T, branch_id=B, user_id=U)
NOW = datetime(2026, 11, 19, 12, tzinfo=UTC)


def c(**kw) -> Control:
    return Control(key="inventory.transfers", name="Stock transfers", **kw)


def test_active_is_plain():
    d = evaluate(c(), WHO, set(), NOW)
    assert (d.visible, d.writable, d.message, d.level) == (True, True, None, "none")


def test_inactive_and_maintenance_keep_reads_and_stop_changes_with_a_message():
    for status in ("inactive", "maintenance"):
        d = evaluate(c(status=status), WHO, set(), NOW)
        assert d.visible and not d.writable and "Stock transfers" in d.message
    assert evaluate(c(status="maintenance", message="Back at 14:00"), WHO, set(), NOW).message == "Back at 14:00"


def test_coming_soon_is_hidden_for_businesses_but_not_for_pesaa():
    assert not evaluate(c(status="coming_soon"), WHO, set(), NOW).visible
    assert evaluate(c(status="coming_soon"), Who(tenant_id=None), set(), NOW).writable


def test_beta_reaches_only_its_cohort_by_business_branch_or_user():
    beta = c(status="beta")
    assert not evaluate(beta, WHO, set(), NOW).visible
    for member in ({("tenant", T)}, {("branch", B)}, {("user", U)}):
        d = evaluate(beta, WHO, member, NOW)
        assert d.visible and d.writable and d.level == "info"
    assert not evaluate(beta, Who(tenant_id=T, branch_id=uuid.uuid4(), user_id=uuid.uuid4()), {("branch", B)}, NOW).visible


def test_deprecated_works_with_a_warning():
    d = evaluate(c(status="deprecated"), WHO, set(), NOW)
    assert d.writable and d.level == "warning" and "retired" in d.message


def test_schedule_takes_effect_at_its_time():
    sched = c(scheduled_status="maintenance", scheduled_message="Upgrade", scheduled_at=NOW + timedelta(hours=1))
    assert evaluate(sched, WHO, set(), NOW).writable
    later = evaluate(sched, WHO, set(), NOW + timedelta(hours=2))
    assert not later.writable and later.message == "Upgrade"


def test_kill_switch_stops_changes_even_for_the_cohort():
    d = evaluate(c(status="beta", kill_switch=True), WHO, {("tenant", T)}, NOW)
    assert d.visible and not d.writable


def test_percentage_rollout_is_stable_and_cohort_skips_it():
    assert bucket("inventory.transfers", T) == bucket("inventory.transfers", T)
    assert not evaluate(c(rollout_percent=0), WHO, set(), NOW).visible
    assert evaluate(c(rollout_percent=0), WHO, {("tenant", T)}, NOW).visible
    assert evaluate(c(rollout_percent=100), WHO, set(), NOW).visible
    tenants = [uuid.uuid4() for _ in range(400)]
    share = sum(evaluate(c(rollout_percent=30), Who(tenant_id=t), set(), NOW).visible for t in tenants) / len(tenants)
    assert 0.2 < share < 0.4
    grown = [t for t in tenants if evaluate(c(rollout_percent=30), Who(tenant_id=t), set(), NOW).visible]
    assert all(evaluate(c(rollout_percent=60), Who(tenant_id=t), set(), NOW).visible for t in grown)


def test_actions_off_or_limited_to_administrators():
    rules = c(actions={"delete": "off", "approve": "admins"})
    assert "switched off" in check_action(rules, "delete", WHO)
    assert "owners and administrators" in check_action(rules, "approve", WHO)
    assert check_action(rules, "approve", Who(tenant_id=T, is_admin=True)) is None
    assert check_action(rules, "create", WHO) is None
    assert check_action(rules, None, WHO) is None


def test_requests_are_classified_by_method_and_path():
    assert classify("GET", "/inventory/transfers") is None
    assert classify("GET", "/inventory/reports/export") == "export"
    assert classify("POST", "/inventory/transfers") == "create"
    assert classify("PATCH", "/inventory/transfers/1") == "edit"
    assert classify("DELETE", "/inventory/transfers/1") == "delete"
    assert classify("POST", "/procurement/purchase-orders/1/actions/approve") == "approve"
    assert classify("POST", "/sales/customers/bulk") == "import"


def test_a_request_is_checked_against_its_module_and_every_part_above_it():
    assert request_keys("inventory", "/inventory/serials/9") == ["inventory", "inventory.traceability", "inventory.serials"]
    assert request_keys("inventory", "/inventory/products") == ["inventory"]


def test_catalogue_switch_off_reads_as_inactive():
    assert to_control("hr.leave", "Leave", None, catalogue_on=False).status == "inactive"
    assert to_control("hr.leave", "Leave", None).status == "active"


def test_a_business_exception_wins_and_empty_fields_inherit():
    platform = c(status="active", actions={"delete": "off"}, settings={"daily_create_limit": 5})
    mine = merge(platform, SimpleNamespace(status="maintenance", message=None, actions={"delete": "everyone"}, settings={"daily_create_limit": None}))
    assert mine.status == "maintenance" and mine.overridden and mine.status_overridden
    assert check_action(mine, "delete", WHO) is None  # opened for this business only
    assert mine.setting("daily_create_limit") == 5  # inherited
    assert merge(platform, None) is platform


def test_a_business_status_exception_is_not_replaced_by_the_platform_schedule():
    sched = c(scheduled_status="inactive", scheduled_at=NOW - timedelta(minutes=1))
    mine = merge(sched, SimpleNamespace(status="active", message=None, actions={}, settings={}))
    assert evaluate(mine, WHO, set(), NOW).writable
    assert not evaluate(sched, WHO, set(), NOW).writable


def test_actions_can_be_limited_to_named_roles():
    rules = c(actions={"approve": {"roles": ["Branch manager", "accountant"]}})
    assert check_action(rules, "approve", Who(tenant_id=T, role="accountant")) is None
    assert check_action(rules, "approve", Who(tenant_id=T, role="Branch Manager")) is None
    assert "limited to" in check_action(rules, "approve", Who(tenant_id=T, role="cashier"))
    assert check_action(rules, "approve", Who(tenant_id=T, role="cashier", is_admin=True)) is None


def test_a_part_outside_the_plan_is_hidden_unless_in_the_cohort():
    plan, other = uuid.uuid4(), uuid.uuid4()
    with patch("app.core.config.settings.ENFORCE_PLAN_ENTITLEMENTS", True):
        only = c(settings={"plans": [str(plan)]})
        assert evaluate(only, Who(tenant_id=T, plan_id=plan), set(), NOW).writable
        d = evaluate(only, Who(tenant_id=T, plan_id=other), set(), NOW)
        assert not d.visible and "not part of your plan" in d.message
        assert evaluate(only, Who(tenant_id=T, plan_id=other), {("tenant", T)}, NOW).visible
        assert evaluate(c(), Who(tenant_id=T, plan_id=other), set(), NOW).visible  # no list: every plan with the module


def test_changes_only_inside_the_hours_in_the_business_time_zone():
    hours = c(settings={"write_hours": "07:00-20:00", "timezone": "Africa/Kigali"})
    assert outside_hours(hours, datetime(2026, 11, 19, 8, tzinfo=UTC)) is None  # 10:00 in Kigali
    assert "07:00-20:00" in outside_hours(hours, datetime(2026, 11, 19, 19, tzinfo=UTC))  # 21:00 in Kigali
    night = c(settings={"write_hours": "22:00-06:00"})
    assert outside_hours(night, datetime(2026, 11, 19, 1, tzinfo=UTC)) is None  # wraps past midnight
    assert outside_hours(c(), NOW) is None


def test_daily_limit_per_plan_wins_over_the_general_one():
    plan = uuid.uuid4()
    limited = c(settings={"daily_create_limit": 10, "plan_daily_limits": {str(plan): 3}})
    assert daily_limit(limited, Who(tenant_id=T, plan_id=plan)) == 3
    assert daily_limit(limited, Who(tenant_id=T, plan_id=uuid.uuid4())) == 10
    assert daily_limit(c(), WHO) is None


def test_businesses_are_warned_before_a_scheduled_change():
    soon = c(scheduled_status="maintenance", scheduled_at=NOW + timedelta(hours=3))
    assert upcoming(soon, NOW)["status"] == "maintenance"
    assert upcoming(c(scheduled_status="maintenance", scheduled_at=NOW + timedelta(days=3)), NOW) is None
    assert upcoming(c(scheduled_status="maintenance", scheduled_at=NOW + timedelta(days=3), settings={"notice_hours": 96}), NOW) is not None


def test_dependencies_point_at_real_parts_of_the_same_module():
    keys = {n.key for n in TREE}
    for part, needs in PART_DEPENDENCIES.items():
        assert part in keys and all(n in keys and n.split(".")[0] == part.split(".")[0] for n in needs)
    assert part_dependents("inventory.serials") == ["inventory.warranty"]


def test_feature_specific_settings_are_listed_with_the_common_ones():
    names = [s.name for s in settings_for("sales.returns")]
    assert {"daily_create_limit", "write_hours", "return_window_days", "approval_above"} <= set(names)
    assert "return_window_days" not in [s.name for s in settings_for("inventory.transfers")]
