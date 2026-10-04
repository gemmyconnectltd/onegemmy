import smtplib
from unittest.mock import MagicMock, patch

import pytest

from app.core.email import (
    _reset_body,
    _resolve_smtp_credentials,
    _welcome_body,
    send_account_approved_email,
    send_email,
    send_invite_email,
    send_password_reset_email,
    send_pending_signup_email,
    send_welcome_email,
)

TO_EMAIL = "robertniyitanga3@gmail.com"
FROM_EMAIL = "eplotrobert@gmail.com"


def _mock_smtp_server() -> MagicMock:
    """A context-manager-compatible mock standing in for `with smtplib.SMTP(...) as server:`,
    so a test can assert on server.login(...)'s exact arguments."""
    server = MagicMock()
    server.__enter__ = MagicMock(return_value=server)
    server.__exit__ = MagicMock(return_value=False)
    return server


# ── Unit tests (no real SMTP) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_welcome_email_fails_soft_without_credentials(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "")
    result = await send_welcome_email(TO_EMAIL, "Robert", "OneGemmy Test", "onegemmy")
    assert result is False


@pytest.mark.asyncio
async def test_reset_email_fails_soft_without_credentials(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "")
    result = await send_password_reset_email(TO_EMAIL, "Robert", "http://localhost:3000/reset-password?token=abc")
    assert result is False


@pytest.mark.asyncio
async def test_welcome_email_sends_via_smtp(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", FROM_EMAIL)
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "test_password")

    mock_smtp = MagicMock()
    with patch("app.core.email.smtplib.SMTP", return_value=mock_smtp.__enter__.return_value):
        mock_smtp.__enter__.return_value.sendmail = MagicMock()
        result = await send_welcome_email(TO_EMAIL, "Robert", "OneGemmy Test", "onegemmy", "http://localhost:3000/dashboard")

    assert result is True


@pytest.mark.asyncio
async def test_reset_email_sends_via_smtp(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", FROM_EMAIL)
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "test_password")

    mock_smtp = MagicMock()
    with patch("app.core.email.smtplib.SMTP", return_value=mock_smtp.__enter__.return_value):
        mock_smtp.__enter__.return_value.sendmail = MagicMock()
        result = await send_password_reset_email(TO_EMAIL, "Robert", "http://localhost:3000/reset-password?token=abc")

    assert result is True


@pytest.mark.asyncio
async def test_smtp_error_returns_false(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", FROM_EMAIL)
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "wrong_password")

    with patch("app.core.email.smtplib.SMTP", side_effect=smtplib.SMTPAuthenticationError(535, b"Bad credentials")):
        result = await send_welcome_email(TO_EMAIL, "Robert", "OneGemmy Test", "onegemmy")

    assert result is False


def test_template_body_escapes_user_input():
    body = _welcome_body('Robert <script>alert(1)</script>', "Fresh <b>Mart</b>", "freshmart", "http://localhost:3000/dashboard")
    assert "<script>" not in body
    assert "<b>" not in body


def test_reset_body_contains_link():
    body = _reset_body("Robert", "http://localhost:3000/reset-password?token=abc")
    assert "http://localhost:3000/reset-password?token=abc" in body


@pytest.mark.asyncio
async def test_invite_email_fails_soft_without_credentials(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "")
    result = await send_invite_email(TO_EMAIL, "Robert", "OneGemmy Test", "temp123")
    assert result is False


@pytest.mark.asyncio
async def test_invite_email_sends_via_smtp(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", FROM_EMAIL)
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "test_password")

    mock_smtp = MagicMock()
    with patch("app.core.email.smtplib.SMTP", return_value=mock_smtp.__enter__.return_value):
        mock_smtp.__enter__.return_value.sendmail = MagicMock()
        result = await send_invite_email(TO_EMAIL, "Robert", "OneGemmy Test", "temp123")

    assert result is True


# ── Per-category sender (accounts@pesaa.io / admin@pesaa.io) ─────────────────

def test_resolve_smtp_credentials_accounts_uses_accounts_vars(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "accounts@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "acc-pass")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_EMAIL_FROM", "Pesaa Accounts <accounts@pesaa.io>")
    assert _resolve_smtp_credentials("accounts") == ("accounts@pesaa.io", "acc-pass", "Pesaa Accounts <accounts@pesaa.io>")


def test_resolve_smtp_credentials_admin_uses_admin_vars(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_USER", "admin@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_PASSWORD", "admin-pass")
    monkeypatch.setattr("app.core.email.settings.ADMIN_EMAIL_FROM", "Pesaa Admin <admin@pesaa.io>")
    assert _resolve_smtp_credentials("admin") == ("admin@pesaa.io", "admin-pass", "Pesaa Admin <admin@pesaa.io>")


def test_resolve_smtp_credentials_falls_back_to_legacy_settings(monkeypatch):
    """A deployment that hasn't set the new ACCOUNTS_*/ADMIN_* vars yet keeps
    sending from the single legacy mailbox, for either category."""
    for key in ("ACCOUNTS_SMTP_USER", "ACCOUNTS_SMTP_PASSWORD", "ACCOUNTS_EMAIL_FROM",
                "ADMIN_SMTP_USER", "ADMIN_SMTP_PASSWORD", "ADMIN_EMAIL_FROM"):
        monkeypatch.setattr(f"app.core.email.settings.{key}", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "legacy@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "legacy-pass")
    monkeypatch.setattr("app.core.email.settings.EMAIL_FROM", "Pesaa <legacy@pesaa.io>")
    expected = ("legacy@pesaa.io", "legacy-pass", "Pesaa <legacy@pesaa.io>")
    assert _resolve_smtp_credentials("accounts") == expected
    assert _resolve_smtp_credentials("admin") == expected


@pytest.mark.asyncio
async def test_send_email_default_sender_is_accounts(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "accounts@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "acc-pass")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_USER", "admin@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_PASSWORD", "admin-pass")

    server = _mock_smtp_server()
    with patch("app.core.email.smtplib.SMTP", return_value=server):
        result = await send_email(TO_EMAIL, "Subject", "<p>Body</p>")  # no sender kwarg

    assert result is True
    server.login.assert_called_once_with("accounts@pesaa.io", "acc-pass")


@pytest.mark.asyncio
async def test_send_email_admin_sender_uses_admin_mailbox(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "accounts@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "acc-pass")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_USER", "admin@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_PASSWORD", "admin-pass")

    server = _mock_smtp_server()
    with patch("app.core.email.smtplib.SMTP", return_value=server):
        result = await send_email(TO_EMAIL, "Subject", "<p>Body</p>", sender="admin")

    assert result is True
    server.login.assert_called_once_with("admin@pesaa.io", "admin-pass")


@pytest.mark.asyncio
async def test_send_email_without_sender_kwarg_still_works(monkeypatch):
    """Backward compatibility: an existing caller that doesn't pass `sender`
    at all keeps working exactly as before, via the legacy-mailbox fallback."""
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", FROM_EMAIL)
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "test_password")

    server = _mock_smtp_server()
    with patch("app.core.email.smtplib.SMTP", return_value=server):
        result = await send_email(TO_EMAIL, "Subject", "<p>Body</p>")

    assert result is True
    server.login.assert_called_once_with(FROM_EMAIL, "test_password")


@pytest.mark.asyncio
async def test_welcome_email_defaults_to_accounts_sender(monkeypatch):
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "accounts@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "acc-pass")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_PASSWORD", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "")

    server = _mock_smtp_server()
    with patch("app.core.email.smtplib.SMTP", return_value=server):
        result = await send_welcome_email(TO_EMAIL, "Robert", "OneGemmy Test", "onegemmy")

    assert result is True
    server.login.assert_called_once_with("accounts@pesaa.io", "acc-pass")


@pytest.mark.asyncio
async def test_pending_signup_email_defaults_to_admin_sender(monkeypatch):
    """Approval/admin-review mail must use the admin@pesaa.io mailbox by
    default — proven here by only giving the admin mailbox credentials."""
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_USER", "admin@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_PASSWORD", "admin-pass")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "")

    server = _mock_smtp_server()
    with patch("app.core.email.smtplib.SMTP", return_value=server):
        result = await send_pending_signup_email(TO_EMAIL, "OneGemmy Test", "onegemmy", "http://localhost/admin/tenants/1")

    assert result is True
    server.login.assert_called_once_with("admin@pesaa.io", "admin-pass")


@pytest.mark.asyncio
async def test_account_approved_email_defaults_to_admin_sender(monkeypatch):
    """Approval status notifications must use the admin@pesaa.io mailbox by
    default — same proof technique as the pending-signup test above."""
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_USER", "admin@pesaa.io")
    monkeypatch.setattr("app.core.email.settings.ADMIN_SMTP_PASSWORD", "admin-pass")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.ACCOUNTS_SMTP_PASSWORD", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_USER", "")
    monkeypatch.setattr("app.core.email.settings.SMTP_PASSWORD", "")

    server = _mock_smtp_server()
    with patch("app.core.email.smtplib.SMTP", return_value=server):
        result = await send_account_approved_email(TO_EMAIL, "Robert", "OneGemmy Test", "http://localhost/dashboard")

    assert result is True
    server.login.assert_called_once_with("admin@pesaa.io", "admin-pass")


# ── Live tests (hit real Gmail SMTP) ─────────────────────────────────────────
# Run with: uv run pytest tests/test_email.py -m live -s
# Requires SMTP_PASSWORD set in .env (Gmail App Password)

@pytest.mark.live
@pytest.mark.asyncio
async def test_live_welcome_email():
    ok = await send_welcome_email(
        to=TO_EMAIL,
        full_name="Robert",
        tenant_name="OneGemmy Test",
        tenant_slug="onegemmy",
        dashboard_url="http://localhost:3000/dashboard",
    )
    assert ok is True, "Welcome email failed — check SMTP_USER and SMTP_PASSWORD in .env"


@pytest.mark.live
@pytest.mark.asyncio
async def test_live_password_reset_email():
    ok = await send_password_reset_email(
        to=TO_EMAIL,
        full_name="Robert",
        reset_link="http://localhost:3000/reset-password?token=test-token-123",
    )
    assert ok is True, "Reset email failed — check SMTP_USER and SMTP_PASSWORD in .env"


@pytest.mark.live
@pytest.mark.asyncio
async def test_live_invite_email():
    ok = await send_invite_email(
        to=TO_EMAIL,
        full_name="Robert",
        tenant_name="OneGemmy Test",
        temp_password="TempPass123!",
    )
    assert ok is True, "Invite email failed — check SMTP_USER and SMTP_PASSWORD in .env"
