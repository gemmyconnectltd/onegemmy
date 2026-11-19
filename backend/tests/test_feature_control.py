"""Pesaa's full feature control: statuses, schedule, beta cohort, rollout, kill switch and action rules."""
import uuid
from datetime import UTC, datetime, timedelta

from app.modules.tenants.service.feature_control import (
    Control, Who, bucket, check_action, classify, evaluate, request_keys, to_control,
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
