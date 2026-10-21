"""Pending activation must not be reported as suspension or invalid credentials."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.exceptions import UnauthorizedError
from app.modules.auth.schemas import LoginRequest
from app.modules.auth.service import login


@pytest.mark.parametrize(
    ("status", "password_valid", "message"),
    [
        ("pending", True, "This account is awaiting activation"),
        ("active", True, "This account has been suspended"),
        ("pending", False, "Invalid credentials"),
    ],
)
async def test_inactive_business_login(status, password_valid, message):
    user = SimpleNamespace(
        id=uuid4(), tenant_id=uuid4(), is_active=True, hashed_password="hash",
        tenant=SimpleNamespace(is_active=False, subscription_status=status),
    )
    db = AsyncMock()
    with (
        patch("app.modules.auth.service.UserRepository") as repository,
        patch("app.modules.auth.service.verify_password", return_value=password_valid),
    ):
        repository.return_value.get_by_email_global = AsyncMock(return_value=user)
        with pytest.raises(UnauthorizedError) as exc:
            await login(db, LoginRequest(email="owner@example.com", password="password"))
    assert exc.value.detail == message
    db.commit.assert_not_awaited()
