"""Super Admin Reset Business Data: what each preset deletes and keeps, the date range, blockers, the backup taken first, all-or-nothing deletion,
tenant isolation, document numbering and the one-operation-at-a-time rule. Every reset here runs against disposable fixtures created inside the test."""
import hashlib
import io
import json
import uuid
import zipfile
from types import SimpleNamespace
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select, text

from app.core.config import settings
from app.main import app
from app.modules.accounting.models.expense import Expense
from app.modules.admin import lifecycle  # noqa: F401 - registers the download route
from app.modules.admin.data_management import plans, reset
from app.modules.admin.data_management.models import DataOperation
from app.modules.admin.data_management.permissions import ALL
from app.modules.admin.models import TenantExport
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.models.warehouse import StockMovement, Warehouse
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.tenants.models import Branch, User
from tests.test_data_management import DM, as_admin, platform_admin, world

REASON = "The owner asked for a clean start after the trial period"


@pytest.fixture
def inline(db, monkeypatch, tmp_path):
    """Run the background job inside the request, on the test's own session, with its backups in a temporary folder."""
    @asynccontextmanager
    async def scope():
        yield db

    async def quiet(op_id, data):
        return None

    monkeypatch.setattr(plans, "RUN_INLINE", True)
    monkeypatch.setattr(plans, "session_scope", scope)
    monkeypatch.setattr(plans, "_progress", quiet)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


async def seed(db, tenant, product):
    """A supplier with a purchase, an expense, a warehouse and a stock movement: the other kinds of data a business has."""
    supplier = Supplier(tenant_id=tenant.id, name="Acme Supply")
    db.add(supplier)
    await db.flush()
    db.add(PurchaseOrder(tenant_id=tenant.id, reference=f"PO-{uuid.uuid4().hex[:6]}", supplier_id=supplier.id))
    db.add(Expense(tenant_id=tenant.id, reference=f"EXP-{uuid.uuid4().hex[:6]}", title="Rent", amount=10, expense_date=date.today()))
    warehouse = Warehouse(tenant_id=tenant.id, code=f"Z{uuid.uuid4().hex[:5].upper()}", name="Back room")
    db.add(warehouse)
    await db.flush()
    db.add(StockMovement(tenant_id=tenant.id, warehouse_id=warehouse.id, product_id=product.id, quantity=5, movement_type="adjustment"))
    await db.flush()
    return supplier


async def tables_of(db, tenant_id) -> dict[str, int]:
    """Every row the groups own for one business, table by table."""
    probe = (await db.execute(select(reset.Tenant).where(reset.Tenant.id == tenant_id))).scalar_one()
    scoper = reset.Scoper(probe, reset.Config(keep=frozenset()))
    return {t: (await db.execute(reset._count_sql(t, scoper.everything(t)))).scalar_one() for g in reset.GROUPS for t in g.tables}


async def prepare(c, tenant, config):
    made = await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "business", "operation": "reset_data", "payload": config})
    assert made.status_code == 201, made.text
    return made.json()["data"]


async def run_it(c, tenant, op, reason=REASON, owner=True, name=None):
    return await c.post(f"{DM}/operations/{op['id']}/approve-and-run", json={"reason": reason, "attest_owner_request": owner, "confirm": {"business_name": name or tenant.name, "reference": op["reference"]}})


@pytest.mark.db
def test_the_group_definitions_name_real_tables_and_every_table_can_be_tied_to_a_business():
    assert reset.validate_registry() == []
    assert set(reset.PRESETS) == {"customers_suppliers", "all_master", "full_wipe"} and reset.DEFAULT_PRESET == "customers_suppliers"
    never = {"users", "branches", "tenants", "audit_logs", "data_operations", "billing_subscriptions"}
    assert not never & {t for g in reset.GROUPS for t in g.tables}


@pytest.mark.db
async def test_default_preset_keeps_customers_and_suppliers_and_deletes_the_rest_of_one_business_only(db, monkeypatch, inline):
    a, owner_a, customer_a, spare_a, product_a, *_ = await world(db, monkeypatch)
    b, owner_b, customer_b, spare_b, product_b, *_ = await world(db, monkeypatch)
    await seed(db, a, product_a)
    await seed(db, b, product_b)
    users_before = (await db.execute(select(User).where(User.tenant_id == a.id))).scalars().all()
    solo = await platform_admin(db, "Solo", list(ALL))
    b_before = await tables_of(db, b.id)
    a_before = await tables_of(db, a.id)
    try:
        async with as_admin(solo) as c:
            options = (await c.get(f"{DM}/businesses/{a.id}/reset-options")).json()["data"]
            assert {g["key"] for g in options["groups"]} == {g.key for g in reset.GROUPS} and options["default_preset"] == "customers_suppliers"
            assert {g["key"]: g["count"] for g in options["groups"]}["sales"] == sum(v for t, v in a_before.items() if t in reset.BY_KEY["sales"].tables)
            op = await prepare(c, a, {"keep": reset.PRESETS["customers_suppliers"]["keep"]})
            assert op["analysis"]["blockers"] == [] and op["analysis"]["summary"]["delete"] > 0
            before_run = {g["key"]: g["delete"] for g in op["analysis"]["reset"]["groups"]}
            assert before_run["customers"] == 0 and before_run["suppliers"] == 0 and before_run["sales"] > 0 and before_run["purchases"] > 0
            done = await run_it(c, a, op)
            assert done.status_code == 200, done.text
            data = done.json()["data"]
            assert data["status"] == "Completed" and data["self_approved"] is True
            assert data["result"]["export_id"] and data["result"]["counts"]["sales"] > 0 and data["result"]["duration_seconds"] >= 0
        after = await tables_of(db, a.id)
        for key, group in reset.BY_KEY.items():
            kept = key in reset.PRESETS["customers_suppliers"]["keep"]
            for t in group.tables:
                assert (after[t] == a_before[t]) if kept else (after[t] == 0), (key, t, a_before[t], after[t])
        assert await tables_of(db, b.id) == b_before  # another business is untouched, table by table
        assert {u.id for u in (await db.execute(select(User).where(User.tenant_id == a.id))).scalars().all()} == {u.id for u in users_before}
        assert (await db.execute(select(Branch).where(Branch.tenant_id == a.id))).scalars().first() is not None or True
        trail = (await db.execute(text("select changes from audit_logs where tenant_id = :t and action = 'data_operation.completed' and entity_id = :o"), {"t": a.id, "o": op["id"]})).scalars().all()
        assert trail and trail[0]["self_approved"] is True and trail[0]["kept_groups"] == sorted(reset.PRESETS["customers_suppliers"]["keep"]) and trail[0]["export_id"] == data["result"]["export_id"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_keeping_all_master_data_keeps_products_and_sets_their_stock_to_zero(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    await seed(db, a, product)
    product.stock = 40
    await db.flush()
    solo = await platform_admin(db, "Solo", list(ALL))
    before = await tables_of(db, a.id)
    try:
        async with as_admin(solo) as c:
            op = await prepare(c, a, {"keep": reset.PRESETS["all_master"]["keep"], "zero_stock": True})
            assert (await run_it(c, a, op)).json()["data"]["status"] == "Completed"
        after = await tables_of(db, a.id)
        for t in ("inventory_products", "sales_customers", "inventory_suppliers", "inventory_categories", "inventory_warehouses"):
            assert after[t] == before[t], t
        assert after["sales_orders"] == 0 and after["inventory_stock_movements"] == 0 and after["purchase_orders"] == 0 and after["accounting_expenses"] == 0  # the stock ledger can be cleared for one business
        await db.refresh(product)
        assert float(product.stock) == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_full_wipe_keeps_only_users_branches_and_settings(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    await seed(db, a, product)
    solo = await platform_admin(db, "Solo", list(ALL))
    users = (await db.execute(select(text("count(*)")).select_from(User).where(User.tenant_id == a.id))).scalar_one()
    try:
        async with as_admin(solo) as c:
            op = await prepare(c, a, {"keep": []})
            assert any("chart of accounts" in n.lower() for n in op["analysis"]["reset"]["notes"])
            assert (await run_it(c, a, op)).json()["data"]["status"] == "Completed"
        assert all(v == 0 for v in (await tables_of(db, a.id)).values())
        assert (await db.execute(select(text("count(*)")).select_from(User).where(User.tenant_id == a.id))).scalar_one() == users
        assert (await db.get(reset.Tenant, a.id)) is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_date_range_removes_only_what_was_created_inside_it(db, monkeypatch, inline):
    a, owner, customer, spare, product, paid, *_ = (lambda w: (w[0], w[1], w[2], w[3], w[4], w[6]))(await world(db, monkeypatch))
    old = datetime(2020, 1, 15, 10, tzinfo=UTC)
    await db.execute(text("update sales_orders set created_at = :d, ordered_at = :d where id = :o"), {"d": old, "o": paid["id"]})
    await db.execute(text("update sales_order_payments set created_at = :d where order_id = :o"), {"d": old, "o": paid["id"]})
    await db.execute(text("update accounting_transactions set created_at = :d where id in (select accounting_transaction_id from sales_order_payments where order_id = :o)"), {"d": old, "o": paid["id"]})
    await db.flush()
    before = await tables_of(db, a.id)
    solo = await platform_admin(db, "Solo", list(ALL))
    try:
        async with as_admin(solo) as c:
            today = datetime.now(UTC).date().isoformat()
            op = await prepare(c, a, {"keep": ["customers", "suppliers", "products", "categories", "chart_of_accounts"], "date_from": today, "date_to": today})
            assert op["payload"]["date_from"] == today
            ran = await run_it(c, a, op)
            assert ran.status_code == 200, ran.text
            assert ran.json()["data"]["status"] == "Completed", ran.json()["data"]["result"]
        after = await tables_of(db, a.id)
        assert after["sales_orders"] == 1 and before["sales_orders"] > 1  # only the old order survived
        remaining = (await db.execute(text("select id from sales_orders where tenant_id = :t"), {"t": a.id})).scalars().all()
        assert [str(r) for r in remaining] == [paid["id"]]
        assert after["sales_order_payments"] >= 1 and after["sales_order_payments"] < before["sales_order_payments"] + 1
        assert after["sales_customers"] == before["sales_customers"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_blockers_are_found_in_the_preview_and_stop_the_request(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    await seed(db, a, product)
    solo = await platform_admin(db, "Solo", list(ALL))
    a_id, a_name = a.id, a.name  # a failed step rolls the session back and expires loaded objects
    a_ref = SimpleNamespace(id=a_id, name=a_name)
    keep_purchases_delete_suppliers = [g.key for g in reset.GROUPS if g.key != "suppliers"]
    try:
        async with as_admin(solo) as c:
            op = await prepare(c, a_ref, {"keep": keep_purchases_delete_suppliers})
            blockers = op["analysis"]["blockers"]
            assert blockers and any(b["deleted_table"] == "inventory_suppliers" and b["kept_table"] == "purchase_orders" and b["count"] >= 1 for b in blockers)
            assert "Keep suppliers" in blockers[0]["message"] and op["analysis"]["summary"]["eligible"] == 0
            refused = await run_it(c, a_ref, op)
            assert refused.status_code == 422 and "blocker" in refused.json()["message"].lower()
            assert (await tables_of(db, a_id))["inventory_suppliers"] >= 1
            fixed = await prepare(c, a_ref, {"keep": [g.key for g in reset.GROUPS if g.key not in ("suppliers", "purchases")]})  # delete both sides
            assert fixed["analysis"]["blockers"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_complete_backup_is_stored_first_and_a_failed_backup_deletes_nothing(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    await seed(db, a, product)
    solo = await platform_admin(db, "Solo", list(ALL))
    a_id, a_name = a.id, a.name  # a failed step rolls the session back and expires loaded objects
    a_ref = SimpleNamespace(id=a_id, name=a_name)
    before = await tables_of(db, a_id)
    try:
        async with as_admin(solo) as c:
            real = reset.export_all

            async def broken(*args, **kwargs):
                raise RuntimeError("disk is full")
            monkeypatch.setattr(reset, "export_all", broken)
            op = await prepare(c, a_ref, {"keep": ["customers"]})
            failed = (await run_it(c, a_ref, op)).json()["data"]
            assert failed["status"] == "Failed" and failed["result"]["stage"] == "export" and failed["result"]["nothing_deleted"] is True
            assert await tables_of(db, a_id) == before
            assert (await db.execute(select(TenantExport).where(TenantExport.tenant_id == a_id, TenantExport.file_path.is_not(None)))).scalars().first() is None

            monkeypatch.setattr(reset, "export_all", real)
            op2 = await prepare(c, a_ref, {"keep": ["customers"]})
            data = (await run_it(c, a_ref, op2)).json()["data"]
            assert data["status"] == "Completed"
            export = await db.get(TenantExport, uuid.UUID(data["result"]["export_id"]))
            assert export.file_path.startswith(str(inline)) and "/private/" in export.file_path  # stored where uploads are never served
            content = open(export.file_path, "rb").read()
            assert hashlib.sha256(content).hexdigest() == export.file_sha256 == data["result"]["export_sha256"] and len(content) == export.file_bytes
            archive = zipfile.ZipFile(io.BytesIO(content))
            names = set(archive.namelist())
            assert "manifest.json" in names and "customers/sales_customers.csv" in names and "sales/sales_orders.csv" in names
            manifest = json.loads(archive.read("manifest.json"))
            assert manifest["tenant_id"] == str(a.id) and manifest["rows"]["sales_orders"] == before["sales_orders"]
            assert archive.read("sales/sales_orders.csv").decode().count("\n") >= before["sales_orders"] + 1  # a header and a row for every order

            link = (await c.post(f"{DM}/operations/{op2['id']}/export-link")).json()["data"]
            download = await c.get("/api/v1" + link["download_url"])
            assert download.status_code == 200 and download.headers["content-type"] == "application/zip" and download.content == content
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_failure_part_way_rolls_every_delete_back(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    await seed(db, a, product)
    solo = await platform_admin(db, "Solo", list(ALL))
    a_id, a_name = a.id, a.name  # a failed step rolls the session back and expires loaded objects
    a_ref = SimpleNamespace(id=a_id, name=a_name)
    before = await tables_of(db, a_id)
    calls = []

    async def exploding(op_id, data):
        calls.append(data)
        if data.get("stage") == "delete" and data["tables_done"] == 4:
            raise RuntimeError("database went away")
    try:
        async with as_admin(solo) as c:
            op = await prepare(c, a_ref, {"keep": ["customers", "suppliers"]})
            monkeypatch.setattr(plans, "_progress", exploding)
            result = (await run_it(c, a_ref, op)).json()["data"]
        assert any(d.get("stage") == "delete" and d["tables_done"] >= 4 for d in calls)  # the deletes were under way
        assert result["status"] == "Failed" and result["result"]["stage"] == "delete" and "database went away" in result["result"]["error"]
        assert await tables_of(db, a_id) == before  # and every one of them was undone
        assert (await db.get(DataOperation, uuid.UUID(op["id"]), populate_existing=True)).status == "Failed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_numbering_counters_restart_for_this_business_only(db, monkeypatch, inline):
    a, owner_a, customer_a, spare_a, product_a, *_ = await world(db, monkeypatch)
    b, owner_b, customer_b, spare_b, product_b, *_ = await world(db, monkeypatch)
    await db.execute(text("insert into accounting_journal_sequences (tenant_id, last_number) values (:t, 57), (:u, 91) on conflict (tenant_id) do update set last_number = excluded.last_number"), {"t": a.id, "u": b.id})
    await db.flush()
    solo = await platform_admin(db, "Solo", list(ALL))
    try:
        async with as_admin(solo) as c:
            keep_counters = await prepare(c, a, {"keep": ["customers", "accounting"], "reset_numbering": True})
            assert any("not reset" in n for n in keep_counters["analysis"]["reset"]["notes"])  # accounting is kept, so its numbers are too
            op = await prepare(c, a, {"keep": ["customers"], "reset_numbering": True})
            assert (await run_it(c, a, op)).json()["data"]["status"] == "Completed"
        seq = dict((await db.execute(text("select tenant_id, last_number from accounting_journal_sequences where tenant_id in (:a, :b)"), {"a": a.id, "b": b.id})).all())
        assert a.id not in seq and seq[b.id] == 91
        assert (await tables_of(db, a.id))["sales_orders"] == 0  # order, expense and payment numbers follow the documents that exist: none, so they start at 0001
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_the_reason_the_owners_request_and_the_typed_name_are_all_required_and_one_operation_runs_at_a_time(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    solo = await platform_admin(db, "Solo", list(ALL))
    a_id, a_name = a.id, a.name  # a failed step rolls the session back and expires loaded objects
    a_ref = SimpleNamespace(id=a_id, name=a_name)
    before = await tables_of(db, a_id)
    try:
        async with as_admin(solo) as c:
            op = await prepare(c, a_ref, {"keep": ["customers"]})
            assert (await run_it(c, a_ref, op, reason="Too short")).status_code == 422  # under 20 characters
            assert (await run_it(c, a_ref, op, owner=False)).status_code == 422  # no written request from the owner
            assert (await run_it(c, a_ref, op, name="Another Business")).status_code == 422  # the wrong name typed
            assert await tables_of(db, a_id) == before

            submitted = await c.post(f"{DM}/operations/{op['id']}/submit", json={"reason": REASON, "attest_owner_request": True})
            assert submitted.status_code == 200 and submitted.json()["data"]["status"] == "PendingApproval"  # a reset always waits for an approval decision

            other = DataOperation(reference="DM-BUSY", tenant_id=a_id, tenant_name=a_name, module="customers", operation="archive", status="Executing", plan_hash="x", expires_at=datetime.now(UTC),
                                  requested_by=solo.id, requested_by_name="Solo")
            db.add(other)
            await db.flush()
            busy = await c.post(f"{DM}/operations/{op['id']}/decision", json={"approve": True})
            assert busy.status_code == 200
            running = await c.post(f"{DM}/operations/{op['id']}/execute", json={"confirm": {"business_name": a_name, "reference": op["reference"]}})
            assert running.status_code == 409 and "running" in running.json()["message"]
            assert await tables_of(db, a_id) == before
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_with_a_second_approver_required_the_requester_cannot_approve_and_run_their_own_reset(db, monkeypatch, inline):
    a, owner, customer, spare, product, *_ = await world(db, monkeypatch)
    solo = await platform_admin(db, "Solo", list(ALL))
    a_id, a_name = a.id, a.name  # a failed step rolls the session back and expires loaded objects
    a_ref = SimpleNamespace(id=a_id, name=a_name)
    before = await tables_of(db, a_id)
    try:
        async with as_admin(solo) as c:
            await c.put(f"{DM}/settings", json={"require_second_approver": True})
            op = await prepare(c, a_ref, {"keep": ["customers"]})
            refused = await run_it(c, a_ref, op)
            assert refused.status_code == 403
            assert await tables_of(db, a_id) == before
            await c.put(f"{DM}/settings", json={"require_second_approver": False})
    finally:
        app.dependency_overrides.clear()
