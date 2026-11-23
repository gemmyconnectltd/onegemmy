"""A plan priced before POS, Discounts and Reports were separated from Sales still covers them, and the pricing page says so."""
from datetime import UTC, datetime

from app.modules.tenants.service.feature import plan_modules


def test_sales_plan_priced_before_the_split_covers_pos_discounts_and_reports():
    assert plan_modules(["inventory", "sales"], datetime(2026, 10, 25, tzinfo=UTC)) == {"inventory", "sales", "pos", "discounts", "reports"}


def test_reports_split_later_than_pos():
    assert plan_modules(["sales"], datetime(2026, 11, 15, tzinfo=UTC)) == {"sales", "reports"}


def test_new_plans_and_plans_without_sales_list_only_their_own_modules():
    assert plan_modules(["sales"], datetime(2026, 11, 23, tzinfo=UTC)) == {"sales"}
    assert plan_modules(["inventory"], datetime(2026, 10, 1, tzinfo=UTC)) == {"inventory"}
    assert plan_modules(None, None) == set()
