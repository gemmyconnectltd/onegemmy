import smtplib
from unittest.mock import MagicMock, patch

import pytest

from app.core.email import (
    _reset_body,
    _welcome_body,
    send_invite_email,
    send_password_reset_email,
    send_welcome_email,
)

TO_EMAIL = "robertniyitanga3@gmail.com"
FROM_EMAIL = "eplotrobert@gmail.com"


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
