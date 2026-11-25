"""Sales History summary: the cards and tab counts cover the whole filter, not one page, and match the list."""
import pytest

from app.main import app
from tests.test_sales_team import API, team


@pytest.mark.db
async def test_summary_matches_the_list_for_the_whole_filter(db, monkeypatch):
    _tenant, _ann, _ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            assert (await c.post(f"{API}/sales/orders", json=sale(2))).status_code == 201  # paid in full, cash: 200
            assert (await c.post(f"{API}/sales/orders", json=sale(1, payment_method="mobile"))).status_code == 201  # 100, mobile
            pending = sale(1, status="Pending", amount_paid=0, amount_tendered=0)
            assert (await c.post(f"{API}/sales/orders", json=pending)).status_code == 201
            s = (await c.get(f"{API}/sales/orders/summary")).json()["data"]
            assert s["counts"]["all"] == 3 and s["counts"]["completed"] == 2 and s["counts"]["pending"] == 1
            assert float(s["sales"]) == 300 and s["count"] == 2 and float(s["average"]) == 150
            assert float(s["collected"]) == 300 and float(s["outstanding"]) == 0 and s["collected_share"] == 100.0
            # every tab count matches what the list returns for that tab
            listed = (await c.get(f"{API}/sales/orders", params={"status": "Completed"})).json()["data"]["total"]
            assert listed == s["counts"]["completed"]
            mobile = (await c.get(f"{API}/sales/orders/summary", params={"payment_method": "mobile"})).json()["data"]
            assert mobile["count"] == 1 and float(mobile["sales"]) == 100
            assert (await c.get(f"{API}/sales/orders", params={"payment_method": "mobile"})).json()["data"]["total"] == 1
            dated = (await c.get(f"{API}/sales/orders/summary", params={"from_date": "2026-11-01", "to_date": "2026-11-30"})).json()["data"]
            assert "previous_average" in dated
            team_list = {m["name"]: m for m in (await c.get(f"{API}/sales/team")).json()["data"]}
            assert team_list["Owner"]["sales"] == 3 and team_list["Ann"]["sales"] == 0  # filters offer only people who sold
    finally:
        app.dependency_overrides.clear()
