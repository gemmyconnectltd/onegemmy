"""Business-intelligence tools: figures must match the stored records, stay inside the tenant, and be honest about gaps."""
from datetime import UTC, datetime
from decimal import Decimal as D

import pytest
from sqlalchemy import select
from test_ai import add_customer, add_product, add_sale, ask, make_ctx

from app.modules.accounting.models.expense import Expense
from app.modules.ai.tools import ToolError, run_tool
from app.modules.sales.models.order_item import OrderItem


async def _expense(db, ctx, amount):
    db.add(Expense(tenant_id=ctx.tenant_id, reference=f"E{amount}", title="Rent", amount=amount, expense_date=datetime.now(UTC).date(),
                   category="Rent", status="Approved", base_amount=amount))
    await db.flush()


async def _set_cost(db, order, cost):
    item = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalar_one()
    item.cost_at_sale = cost
    await db.flush()


async def test_profit_is_sales_minus_cost_minus_expenses(db):
    ctx = await make_ctx(db)
    o = await add_sale(db, ctx, 100000)
    await _set_cost(db, o, D(40000))
    await _expense(db, ctx, 10000)
    r = await run_tool(ctx, "profit_summary", {"period": "this_month"})
    assert D(r["metrics"]["net_profit"]) == 50000 and "RWF 50,000" in r["headline"] and r["note"] is None


async def test_profit_warns_when_costs_are_missing(db):
    ctx = await make_ctx(db)
    await add_sale(db, ctx, 100000)
    r = await run_tool(ctx, "profit_summary", {"period": "this_month"})
    assert "purchase cost" in r["note"]


async def test_compare_and_trend_use_real_totals(db):
    ctx = await make_ctx(db)
    await add_sale(db, ctx, 30000)
    await add_sale(db, ctx, 20000)
    r = await run_tool(ctx, "compare_sales", {"first": "this_month", "second": "last_month"})
    assert D(r["metrics"]["first"]) == 50000 and D(r["metrics"]["second"]) == 0
    t = await run_tool(ctx, "revenue_trend", {"period": "this_month"})
    assert D(t["metrics"]["total"]) == 50000 and t["chart"]["values"] == [50000.0]


async def test_inventory_value_and_slow_movers(db):
    ctx = await make_ctx(db)
    await add_product(db, ctx, "Stale Item", price=1000, cost=600, stock=10)
    v = await run_tool(ctx, "inventory_value", {})
    assert D(v["metrics"]["cost_value"]) == 6000 and D(v["metrics"]["retail_value"]) == 10000
    s = await run_tool(ctx, "slow_moving_products", {})
    assert s["table"]["rows"][0][0] == "Stale Item" and "sold nothing" in s["headline"]


async def test_new_customers_unpaid_invoices_and_overview(db):
    ctx = await make_ctx(db)
    await add_customer(db, ctx, "Fresh Co")
    o = await add_sale(db, ctx, 8000)
    o.amount_paid = 3000
    await db.flush()
    assert (await run_tool(ctx, "new_customers", {"period": "this_month"}))["metrics"]["new"] == 1
    inv = await run_tool(ctx, "unpaid_invoices", {})
    assert inv["table"]["rows"][0][2] == "RWF 5,000"
    overview = await run_tool(ctx, "business_overview", {"period": "this_month"})
    assert "RWF 8,000" in overview["headline"] and "sales_summary" in overview["metrics"]


async def test_new_tools_never_cross_tenants(db):
    a, b = await make_ctx(db), await make_ctx(db)
    o = await add_sale(db, a, 77777)
    await _set_cost(db, o, D(1))
    await add_product(db, a, "Secret Stock", stock=5)
    await _expense(db, a, 4444)
    for name, args in (("profit_summary", {"period": "this_month"}), ("revenue_trend", {"period": "this_month"}), ("unpaid_invoices", {}),
                       ("inventory_value", {}), ("slow_moving_products", {}), ("business_overview", {"period": "this_month"})):
        text = str(await run_tool(b, name, args))
        assert "77,777" not in text and "77777" not in text and "Secret Stock" not in text, name


async def test_follow_up_and_plain_questions_work_with_the_offline_assistant(db):
    ctx = await make_ctx(db)
    await add_sale(db, ctx, 12000)
    for q, tool in (("How is my business doing?", "business_overview"), ("What is my profit this month?", "profit_summary"),
                    ("Compare this month with last month", "compare_sales"), ("What is my inventory value?", "inventory_value")):
        assert tool in (await ask(db, ctx, q)).tools_used, q


async def test_how_many_counts_real_records_and_respects_permissions(db):
    ctx = await make_ctx(db)
    await add_product(db, ctx, "In", stock=5)
    await add_product(db, ctx, "Out", stock=0)
    await add_customer(db, ctx, "C1")
    r = await run_tool(ctx, "how_many", {"what": "products"})
    assert r["metrics"] == {"total": 2, "active": 2, "in_stock": 1, "out_of_stock": 1}
    assert (await run_tool(ctx, "how_many", {"what": "customers"}))["metrics"]["total"] == 1
    assert "2 products" in (await ask(db, ctx, "how many products do we have")).text
    other = await make_ctx(db)
    assert (await run_tool(other, "how_many", {"what": "products"}))["metrics"]["total"] == 0          # never another business's count
    with pytest.raises(ToolError):
        await run_tool(await make_ctx(db, owner=False), "how_many", {"what": "products"})


async def test_product_lookup_answers_price_stock_and_rankings(db):
    ctx = await make_ctx(db)
    await add_product(db, ctx, "Blue Pen", price=500, cost=300, stock=40)
    await add_product(db, ctx, "Gold Watch", price=90000, cost=60000, stock=2)
    one = await run_tool(ctx, "find_products", {"search": "pen"})
    assert "Blue Pen" in one["headline"] and "40 in stock" in one["headline"] and "RWF 500" in one["headline"]
    top = await run_tool(ctx, "find_products", {"sort": "highest_price"})
    assert top["table"]["rows"][0][0] == "Gold Watch" and "Gold Watch" in top["headline"]
    assert "couldn't find" in (await run_tool(ctx, "find_products", {"search": "zzz"}))["headline"]
    assert "Gold Watch" in (await ask(db, ctx, "what is the most expensive product?")).text
    assert "Blue Pen" in (await ask(db, ctx, "price of pen")).text


async def test_customer_supplier_and_order_lookups_are_scoped_and_private(db):
    ctx, other = await make_ctx(db), await make_ctx(db)
    c = await add_customer(db, ctx, "Ama Traders")
    o = await add_sale(db, ctx, 12000)
    o.customer_id = c.id
    await db.flush()
    found = await run_tool(ctx, "find_customers", {"search": "ama"})
    assert "12,000" in found["headline"] and "secret.test" not in str(found) and "+250" not in str(found)      # no contact details
    assert "couldn't find" in (await run_tool(other, "find_customers", {"search": "ama"}))["headline"]
    ov = await run_tool(ctx, "orders_overview", {"period": "this_month"})
    assert ov["metrics"] == {"Completed": 1} and "1 order" in ov["headline"]
    assert (await run_tool(other, "orders_overview", {"period": "this_month"}))["metrics"] == {}
    assert "couldn't find" in (await run_tool(ctx, "find_suppliers", {"search": "nobody"}))["headline"]


async def test_about_me_describes_only_the_signed_in_user(db):
    ctx, other = await make_ctx(db), await make_ctx(db)
    r = await run_tool(ctx, "about_me", {})
    assert ctx.user.full_name in r["headline"] and "RWF" in r["headline"] and "hashed" not in str(r) and ctx.user.email not in str(r)
    for q in ("who am I?", "who is logged in", "which branch am I in"):
        assert "about_me" in (await ask(db, ctx, q)).tools_used, q
    from app.modules.tenants.models import Tenant

    mine, theirs = await db.get(Tenant, ctx.tenant_id), await db.get(Tenant, other.tenant_id)
    text = (await ask(db, ctx, "who am i")).text
    assert mine.name in text and theirs.name not in text                 # only my own business is ever described
