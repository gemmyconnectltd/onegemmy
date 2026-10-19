"""Unexpected API failures retain the JSON envelope and allowed-origin headers."""
import httpx
import pytest

from app.main import create_app


@pytest.mark.asyncio
async def test_unhandled_error_keeps_cors_headers():
    app = create_app()

    @app.get("/test-error-cors")
    async def fail():
        raise RuntimeError("private diagnostic")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/test-error-cors", headers={"Origin": "http://localhost:3000"},
        )
    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.json()["message"] == "Internal server error"
    assert "private diagnostic" not in response.text
