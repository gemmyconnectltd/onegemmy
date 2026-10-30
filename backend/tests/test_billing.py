"""Financial/isolation checks. Database fixtures roll back every test write."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError as SchemaError
from sqlalchemy import select

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.billing import payments, provider, service
from app.modules.billing.access import enforce_write
from app.modules.billing.models import BillingInvoice, BillingPayment, BillingPrice
from app.modules.billing.money import cost, next_period, proration
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import ChangeRequest, PlanInput, PriceTerms, SubscriptionAction
from app.modules.billing.worker import process_subscription
from app.modules.tenants.models import Tenant, User


def terms(**patch):
    return {
        **PriceTerms(
            currency="RWF",
            monthly=10000,
            annual=100000,
            seat_monthly=1000,
            included_users=1,
            bill_active_users=True,
        ).model_dump(),
        **patch,
    }


def test_money_and_calendar():
    assert cost(terms(tax_bps=1800), "monthly", 4, 1, 1500) == {
        "subtotal": 11050,
        "discount": 1950,
        "tax": 1989,
        "total": 13039,
    }
    assert cost(terms(), "annual", 3, 1)["total"] == 124000
    start = datetime(2024, 1, 31, tzinfo=UTC)
    end = next_period(start, "monthly")
    assert end == datetime(2024, 2, 29, tzinfo=UTC)
    assert next_period(end, "annual") == datetime(2025, 2, 28, tzinfo=UTC)
    midpoint = start + (end - start) / 2
    assert proration(10000, 20000, start, end, midpoint) == 5000
    assert proration(20000, 10000, start, end, midpoint) == -5000
    assert provider.amount_string(12345, 2) == "123.45"
    assert provider.amount_string(10000, 0) == "10000"


def test_client_prices_and_tenant_admin_are_not_platform_authority():
    with pytest.raises(SchemaError):
        PriceTerms.model_validate(terms(monthly=1.5))
    with pytest.raises(SchemaError):
        ChangeRequest.model_validate({"plan_id": uuid.uuid4(), "currency": "RWF", "price": 1})
    actor = SimpleNamespace(tenant_id=uuid.uuid4(), is_superuser=True, role="owner")
    with pytest.raises(ForbiddenError):
        service.authorize(actor, "update", platform=True)


@pytest.fixture
async def billing(db, monkeypatch):
    from app.core.config import settings
    # These tests are about the subscription rules themselves, which are off by default.
    monkeypatch.setattr(settings, "ENFORCE_SUBSCRIPTION_WRITE_BLOCK", True)
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", True)
    monkeypatch.setattr(
        BillingRepository,
        "catalog",
        AsyncMock(return_value=({"sales", "hr"}, {"RWF": 0, "USD": 2})),
    )
    tenant = Tenant(name="Billing test", slug=f"billing-{uuid.uuid4().hex}")
    other = Tenant(name="Other test", slug=f"billing-{uuid.uuid4().hex}")
    db.add_all([tenant, other])
    await db.flush()
    owner = User(
        tenant_id=tenant.id,
        email=f"{uuid.uuid4().hex}@example.test",
        full_name="Owner",
        hashed_password="unused",
        role="owner",
        is_superuser=True,
        is_active=True,
    )
    admin = User(
        email=f"{uuid.uuid4().hex}@example.test",
        full_name="Platform",
        hashed_password="unused",
        role="superadmin",
        is_superuser=True,
        is_active=True,
    )
    db.add_all([owner, admin])
    await db.commit()

    async def plan(**patch):
        data = PlanInput(
            name="Test Plan", status="active", prices=[PriceTerms.model_validate(terms(**patch))]
        )
        return await service.save_plan(db, admin, data, None, str(uuid.uuid4()))

    return SimpleNamespace(db=db, tenant=tenant, other=other, owner=owner, admin=admin, plan=plan)


async def subscribe(b, plan):
    quote = await service.preview_change(
        b.db, b.owner, b.tenant.id, ChangeRequest(plan_id=plan["id"], currency="RWF")
    )
    key = str(uuid.uuid4())
    result = await service.confirm_change(
        b.db, b.owner, b.tenant.id, uuid.UUID(quote["quote_id"]), key
    )
    return quote, result, key


@pytest.mark.db
async def test_trial_price_version_and_idempotency(billing):
    b = billing
    plan = await b.plan(trial_days=14)
    quote, result, key = await subscribe(b, plan)
    assert result["subscription"]["status"] == "trialing" and quote["due_now"] == 0
    assert result == await service.confirm_change(
        b.db, b.owner, b.tenant.id, uuid.UUID(quote["quote_id"]), key
    )
    with pytest.raises(ConflictError):
        await service.confirm_change(b.db, b.owner, b.tenant.id, uuid.uuid4(), key)
    updated = await service.save_plan(
        b.db,
        b.admin,
        PlanInput(
            name="Changed",
            status="active",
            expected_version=1,
            prices=[PriceTerms.model_validate(terms(monthly=20000))],
        ),
        uuid.UUID(plan["id"]),
        str(uuid.uuid4()),
    )
    assert updated["version"] == 2
    sub = await BillingRepository(b.db).subscription(b.tenant.id)
    assert sub.terms["monthly"] == 10000
    assert (await b.db.get(BillingPrice, sub.price_id)).version == 1


@pytest.mark.db
async def test_tenant_isolation_and_stale_quote(billing):
    b = billing
    plan = await b.plan()
    quote, result, _ = await subscribe(b, plan)
    other_owner = User(tenant_id=b.other.id, is_superuser=True, role="owner")
    with pytest.raises(NotFoundError):
        await service.detail(b.db, other_owner, "invoices", uuid.UUID(result["invoice"]["id"]))
    rows, total = await service.list_records(b.db, other_owner, "invoices", 1, 20, {}, False)
    assert rows == [] and total == 0
    with pytest.raises(ForbiddenError):
        await service.preview_change(
            b.db, b.owner, b.other.id, ChangeRequest(plan_id=plan["id"], currency="RWF")
        )
    with pytest.raises(ConflictError):
        await service.confirm_change(
            b.db, b.owner, b.tenant.id, uuid.UUID(quote["quote_id"]), str(uuid.uuid4())
        )


@pytest.mark.db
@pytest.mark.parametrize("outcome", ["COMPLETED", "FAILED", "MISMATCH"])
async def test_provider_confirmation_and_duplicate_callback(billing, monkeypatch, outcome):
    b = billing
    _, result, _ = await subscribe(b, await b.plan())
    invoice_id = uuid.UUID(result["invoice"]["id"])
    payment = BillingPayment(
        tenant_id=b.tenant.id,
        invoice_id=invoice_id,
        amount=10000,
        currency="RWF",
        status="processing",
        reference=uuid.uuid4(),
    )
    b.db.add(payment)
    await b.db.commit()
    verify = AsyncMock(
        return_value={
            "depositId": str(payment.reference),
            "amount": "1" if outcome == "MISMATCH" else "10000",
            "currency": "RWF",
            "status": "COMPLETED" if outcome == "MISMATCH" else outcome,
        }
    )
    monkeypatch.setattr(provider, "verify", verify)
    if outcome == "COMPLETED":
        monkeypatch.setattr(BillingRepository, "catalog", AsyncMock(return_value=(set(), {})))
    if outcome == "MISMATCH":
        with pytest.raises(ConflictError):
            await payments.reconcile(b.db, payment.reference)
    else:
        await payments.reconcile(b.db, payment.reference)
        await payments.reconcile(b.db, payment.reference)
    invoice = await b.db.get(BillingInvoice, invoice_id)
    assert invoice.paid == (10000 if outcome == "COMPLETED" else 0)
    if outcome == "COMPLETED":
        assert invoice.status == "paid" and verify.await_count == 1
        assert (await BillingRepository(b.db).subscription(b.tenant.id)).status == "active"


@pytest.mark.db
async def test_renewal_idempotency_and_read_only_access(billing):
    b = billing
    await subscribe(b, await b.plan(trial_days=7))
    sub = await BillingRepository(b.db).subscription(b.tenant.id)
    sub.period_start = service.now_utc() - timedelta(days=8)
    sub.period_end = service.now_utc() - timedelta(hours=1)
    await b.db.commit()
    await process_subscription(b.db, b.tenant.id)
    await process_subscription(b.db, b.tenant.id)
    invoices = (
        await b.db.scalars(select(BillingInvoice).where(BillingInvoice.tenant_id == b.tenant.id))
    ).all()
    assert len(invoices) == 1 and sub.status == "past_due"
    sub.status = "suspended"
    await b.db.flush()
    with pytest.raises(ForbiddenError):
        await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/sales/orders", "POST")
    await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/sales/orders", "GET")
    await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/billing/invoices/1/pay", "POST")


@pytest.mark.db
async def test_cancel_and_approved_discount(billing):
    b = billing
    await subscribe(b, await b.plan(trial_days=7))
    await service.subscription_action(
        b.db,
        b.admin,
        b.tenant.id,
        SubscriptionAction(action="discount", discount_bps=2000, reason="Approved retention"),
        str(uuid.uuid4()),
    )
    sub = await BillingRepository(b.db).subscription(b.tenant.id)
    assert sub.recurring == 8000
    await service.subscription_action(
        b.db,
        b.owner,
        b.tenant.id,
        SubscriptionAction(action="cancel", reason="Business requested cancellation"),
        str(uuid.uuid4()),
    )
    assert sub.cancel_at_end
    with pytest.raises(ForbiddenError):
        await service.subscription_action(
            b.db,
            b.owner,
            b.tenant.id,
            SubscriptionAction(action="discount", discount_bps=10000, reason="Not authorized"),
            str(uuid.uuid4()),
        )


def test_month_end_anchor_and_encrypted_retry_payload():
    from app.modules.billing.payments import decrypted_payload, encrypted_payload

    feb = datetime(2025, 2, 28, tzinfo=UTC)
    assert next_period(feb, "monthly", 31) == datetime(2025, 3, 31, tzinfo=UTC)
    payload = {"phone": "250700000001", "provider": "EXAMPLE"}
    encrypted = encrypted_payload(payload)
    assert payload["phone"] not in encrypted
    assert decrypted_payload(encrypted) == payload


@pytest.mark.db
async def test_credit_preserves_tax_and_finalized_invoice_amounts(billing):
    from app.modules.billing.service import issue_invoice

    b = billing
    await subscribe(b, await b.plan(trial_days=7, tax_bps=1800))
    sub = await BillingRepository(b.db).subscription(b.tenant.id)
    sub.credit = 5000
    invoice = await issue_invoice(
        b.db,
        sub,
        11800,
        str(uuid.uuid4()),
        "Credit applied",
        sub.period_start,
        sub.period_end,
        1800,
    )
    await b.db.commit()
    assert invoice.total == 11800 and invoice.tax == 1800 and invoice.subtotal == 10000
    assert invoice.paid == 5000 and sub.credit == 0
    from sqlalchemy.exc import DBAPIError

    async with b.db.begin_nested() as nested:
        invoice.total = 1
        with pytest.raises(DBAPIError):
            await b.db.flush()
        await nested.rollback()


@pytest.mark.db
async def test_trial_cycle_change_does_not_extend_trial(billing):
    b = billing
    plan = await b.plan(trial_days=7)
    _, result, _ = await subscribe(b, plan)
    preview = await service.preview_change(
        b.db,
        b.owner,
        b.tenant.id,
        ChangeRequest(plan_id=plan["id"], currency="RWF", cycle="annual"),
    )
    assert preview["period_end"] == result["subscription"]["period_end"]
    assert preview["due_now"] == 0


@pytest.mark.db
async def test_refund_reservation_and_verified_completion(billing, monkeypatch):
    from app.modules.billing import refunds
    from app.modules.billing.repository import refund_reserved
    from app.modules.billing.schemas import RefundRequest

    b = billing
    _, result, _ = await subscribe(b, await b.plan())
    payment = BillingPayment(
        tenant_id=b.tenant.id,
        invoice_id=uuid.UUID(result["invoice"]["id"]),
        reference=uuid.uuid4(),
        amount=10000,
        currency="RWF",
        status="succeeded",
        method="MTN_MOMO_RWA",
    )
    b.db.add(payment)
    await b.db.commit()
    monkeypatch.setattr(
        provider,
        "methods",
        AsyncMock(
            return_value={
                "methods": [
                    {"provider": "MTN_MOMO_RWA", "currency": "RWF", "refunds_supported": True}
                ]
            }
        ),
    )
    monkeypatch.setattr(
        provider, "call", AsyncMock(side_effect=[{"status": "NOT_FOUND"}, {"status": "ACCEPTED"}])
    )
    response = await refunds.initiate(
        b.db,
        b.admin,
        payment.reference,
        RefundRequest(amount=6000, reason="Approved partial service refund"),
        str(uuid.uuid4()),
    )
    assert response["status"] == "processing"
    assert await refund_reserved(b.db, payment.id) == 6000
    with pytest.raises(ValidationError):
        await refunds.initiate(
            b.db,
            b.admin,
            payment.reference,
            RefundRequest(amount=6000, reason="Over-refund prohibited"),
            str(uuid.uuid4()),
        )
    reference = uuid.UUID(str(response["reference"]))
    monkeypatch.setattr(
        provider,
        "call",
        AsyncMock(
            return_value={
                "status": "FOUND",
                "data": {
                    "refundId": str(reference),
                    "depositId": str(payment.reference),
                    "amount": "6000",
                    "currency": "RWF",
                    "status": "COMPLETED",
                },
            }
        ),
    )
    result = await refunds.reconcile(b.db, reference)
    assert result["status"] == "succeeded"
    assert (await refunds.reconcile(b.db, reference))["status"] == "succeeded"
    assert payment.status == "succeeded"  # Original payment history remains unchanged.


@pytest.mark.db
async def test_routes_keep_tenant_data_out_of_admin_and_callbacks(billing, monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app

    b = billing
    _, result, _ = await subscribe(b, await b.plan())
    payment = BillingPayment(
        tenant_id=b.tenant.id,
        invoice_id=uuid.UUID(result["invoice"]["id"]),
        reference=uuid.uuid4(),
        amount=10000,
        currency="RWF",
        status="processing",
    )
    b.db.add(payment)
    await b.db.commit()

    async def database():
        yield b.db

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: b.owner
    monkeypatch.setattr(
        provider,
        "verify",
        AsyncMock(
            return_value={
                "depositId": str(payment.reference),
                "amount": "10000",
                "currency": "RWF",
                "status": "FAILED",
            }
        ),
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/admin/billing/payment-methods")
            assert response.status_code == 403
            response = await client.post(
                "/api/v1/billing/pawapay/callback",
                json={
                    "depositId": str(payment.reference),
                    "status": "COMPLETED",
                    "amount": "10000",
                },
            )
            assert response.status_code == 200
            assert response.json()["data"] == {"received": True}
            assert payment.status == "failed"  # Body's fake success cannot settle an invoice.
    finally:
        app.dependency_overrides.clear()


def test_outbound_signatures_cover_exact_payload(monkeypatch):
    import base64
    import hashlib

    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    from app.core.config import settings

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    monkeypatch.setattr(settings, "PAWAPAY_SIGNING_PRIVATE_KEY", pem)
    monkeypatch.setattr(settings, "PAWAPAY_SIGNING_KEY_ID", "qa-test-key")
    body = b'{"amount":"15","currency":"RWF"}'
    headers = provider.signature_headers("POST", "https://api.sandbox.pawapay.io/v2/deposits", body)
    assert (
        headers["Content-Digest"]
        == f"sha-512=:{base64.b64encode(hashlib.sha512(body).digest()).decode()}:"
    )
    params = headers["Signature-Input"].split("=", 1)[1]
    message = "\n".join(
        [
            '"@method": POST',
            '"@authority": api.sandbox.pawapay.io',
            '"@path": /v2/deposits',
            f'"signature-date": {headers["Signature-Date"]}',
            f'"content-digest": {headers["Content-Digest"]}',
            '"content-type": application/json',
            f'"@signature-params": {params}',
        ]
    )
    signature = base64.b64decode(headers["Signature"].split("=:", 1)[1][:-1])
    key.public_key().verify(
        signature,
        message.encode(),
        padding.PSS(mgf=padding.MGF1(hashes.SHA512()), salt_length=64),
        hashes.SHA512(),
    )


@pytest.mark.db
async def test_grace_period_seats_and_renewal_settlement_align_period(billing, monkeypatch):
    from app.modules.billing.worker import sync_usage

    b = billing
    plan = await b.plan(trial_days=7)
    await subscribe(b, plan)
    repo = BillingRepository(b.db)
    sub = await repo.subscription(b.tenant.id)
    sub.period_start = service.now_utc() - timedelta(days=8)
    sub.period_end = service.now_utc() - timedelta(hours=1)
    await b.db.commit()
    await process_subscription(b.db, b.tenant.id)
    renewal = await repo.first_unpaid(b.tenant.id)
    assert renewal.source_key.startswith("renewal:")
    b.db.add(
        User(
            tenant_id=b.tenant.id,
            email=f"{uuid.uuid4().hex}@example.test",
            full_name="Added user",
            hashed_password="unused",
            role="member",
            is_active=True,
        )
    )
    await b.db.flush()
    await sync_usage(b.db, b.tenant.id)
    await b.db.commit()
    invoices = (
        await b.db.scalars(
            select(BillingInvoice)
            .where(BillingInvoice.tenant_id == b.tenant.id)
            .order_by(BillingInvoice.created_at, BillingInvoice.number)
        )
    ).all()
    assert len(invoices) == 2 and sub.seats == 2 and sub.recurring == 11000
    assert sum(i.total for i in invoices) > 10000
    for invoice in invoices:
        payment = BillingPayment(
            tenant_id=b.tenant.id,
            invoice_id=invoice.id,
            reference=uuid.uuid4(),
            amount=invoice.total,
            currency="RWF",
            status="processing",
        )
        b.db.add(payment)
        await b.db.commit()
        monkeypatch.setattr(
            provider,
            "verify",
            AsyncMock(
                return_value={
                    "depositId": str(payment.reference),
                    "amount": str(payment.amount),
                    "currency": "RWF",
                    "status": "COMPLETED",
                }
            ),
        )
        await payments.reconcile(b.db, payment.reference)
    assert sub.status == "active"
    assert sub.period_end == renewal.period_end and sub.period_start == renewal.period_start


@pytest.mark.db
async def test_expired_period_cannot_be_renewed_free_through_plan_change(billing):
    b = billing
    plan = await b.plan(trial_days=7)
    await subscribe(b, plan)
    sub = await BillingRepository(b.db).subscription(b.tenant.id)
    sub.status = "active"
    sub.period_end = service.now_utc() - timedelta(seconds=1)
    await b.db.commit()
    with pytest.raises(ValidationError):
        await service.preview_change(
            b.db, b.owner, b.tenant.id, ChangeRequest(plan_id=plan["id"], currency="RWF")
        )


@pytest.mark.db
async def test_enrollment_policy_protects_new_businesses_and_preserves_legacy(billing):
    b = billing
    repo = BillingRepository(b.db)
    policy = await repo.settings()
    policy.data = {"require_new_businesses": True}
    b.tenant.billing_required = True
    b.other.billing_required = False
    await b.db.commit()
    with pytest.raises(ForbiddenError):
        await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/sales/orders", "POST")
    await enforce_write(b.db, b.other.id, "/api/v1/tenants/sales/orders", "POST")
    await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/billing/preview", "POST")
    await enforce_write(b.db, b.tenant.id, "/api/v1/support/tickets", "POST")
    overview = await service.overview(b.db, b.owner, b.tenant.id)
    assert overview["enrollment_required"] and overview["legacy_plan"] is None


@pytest.mark.db
async def test_prepared_reporting_keeps_currency_totals_separate(billing):
    from app.modules.billing.worker import refresh_reports

    b = billing
    await subscribe(b, await b.plan())
    dollar_plan = await b.plan(currency="USD")
    quote = await service.preview_change(
        b.db, b.admin, b.other.id, ChangeRequest(plan_id=dollar_plan["id"], currency="USD")
    )
    await service.confirm_change(
        b.db, b.admin, b.other.id, uuid.UUID(quote["quote_id"]), str(uuid.uuid4())
    )
    await refresh_reports(b.db)
    report = await service.billing_report(b.db, b.admin, "", "", "")
    assert {r["currency"]: r["amount"] for r in report["outstanding"]} == {
        "RWF": 10000,
        "USD": 10000,
    }
    filtered = await service.billing_report(b.db, b.admin, "USD", "", "")
    assert all(r["currency"] == "USD" for r in filtered["subscriptions"] + filtered["outstanding"])


@pytest.mark.db
async def test_database_rejects_cross_tenant_payment_identity(billing):
    from sqlalchemy.exc import IntegrityError

    b = billing
    _, result, _ = await subscribe(b, await b.plan())
    async with b.db.begin_nested() as nested:
        b.db.add(
            BillingPayment(
                tenant_id=b.other.id,
                invoice_id=uuid.UUID(result["invoice"]["id"]),
                amount=10000,
                currency="RWF",
                status="processing",
                reference=uuid.uuid4(),
            )
        )
        with pytest.raises(IntegrityError):
            await b.db.flush()
        await nested.rollback()


@pytest.mark.db
async def test_notification_outbox_retries_and_deduplicates(billing, monkeypatch):
    from app.modules.billing import worker
    from app.modules.billing.models import BillingNotice

    b = billing
    await subscribe(b, await b.plan(trial_days=7))
    await service.notice(
        b.db, b.tenant.id, "test-notice-stable", "Billing update", "Review billing"
    )
    await service.notice(
        b.db, b.tenant.id, "test-notice-stable", "Billing update", "Review billing"
    )
    await b.db.commit()
    sender = AsyncMock(return_value=None)
    monkeypatch.setattr(worker, "send_email_message", sender)
    await worker.deliver_notices(b.db)
    notices = (
        await b.db.scalars(select(BillingNotice).where(BillingNotice.tenant_id == b.tenant.id))
    ).all()
    assert len([n for n in notices if n.event_key == "test-notice-stable"]) == 1
    assert all(n.attempts == 1 and n.sent_at is None for n in notices)
    first_attempts = sender.await_count
    await worker.deliver_notices(b.db)
    assert sender.await_count == first_attempts  # Backoff prevents an immediate duplicate send.
    for notice in notices:
        notice.available_at = service.now_utc() - timedelta(seconds=1)
    await b.db.commit()
    sender.return_value = "test-message-id"
    await worker.deliver_notices(b.db)
    assert all(n.attempts == 2 and n.sent_at is not None for n in notices)


@pytest.mark.db
async def test_plan_modules_grant_access_without_allowing_override_escalation(billing):
    from app.modules.tenants.models import FeatureFlag
    from app.modules.tenants.service.feature import get_effective_features

    b = billing
    flag = await b.db.scalar(select(FeatureFlag).where(FeatureFlag.key == "hr"))
    if flag is None:
        flag = FeatureFlag(key="hr", name="HR", module="hr")
        b.db.add(flag)
    flag.default_enabled, flag.is_active = False, True
    b.tenant.features = {"sales": True}
    await b.db.commit()
    await subscribe(b, await b.plan(trial_days=7, modules=["hr"]))
    features = await get_effective_features(b.db, b.tenant.id)
    assert features["hr"] is True
    assert features.get("sales", False) is False
    b.tenant.features = {"hr": False}
    await b.db.commit()
    assert (await get_effective_features(b.db, b.tenant.id))["hr"] is False


@pytest.mark.db
async def test_with_the_write_block_off_a_suspended_subscription_blocks_nothing(billing, monkeypatch):
    """The current default: subscription state (suspended, expired, unpaid) never stops a business changing its own data."""
    from app.core.config import settings
    b = billing
    await subscribe(b, await b.plan(trial_days=7))
    sub = await BillingRepository(b.db).subscription(b.tenant.id)
    sub.status = "suspended"
    await b.db.flush()
    with pytest.raises(ForbiddenError):  # the rule, when it is turned on
        await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/sales/orders", "POST")
    monkeypatch.setattr(settings, "ENFORCE_SUBSCRIPTION_WRITE_BLOCK", False)
    await enforce_write(b.db, b.tenant.id, "/api/v1/tenants/sales/orders", "POST")  # off: nothing is blocked
