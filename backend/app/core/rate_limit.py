"""Lightweight in-memory rate limiting for sensitive auth endpoints.

No Redis/external dependency — a fixed-window counter per (bucket, client IP)
kept in process memory. Fine for a single backend instance; if the app ever
scales to multiple processes this should move to a shared store, but for now
it's a real, working deterrent against register/login/forgot-password abuse
with zero added infrastructure.
"""

import time
from collections import defaultdict

from fastapi import Request, status

from app.core.config import settings
from app.core.exceptions import AppError

_buckets: dict[str, list[float]] = defaultdict(list)


class RateLimitedError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    detail = "Too many attempts. Please wait a bit and try again."


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, limit: int, window_seconds: int):
    """FastAPI dependency: allow at most `limit` calls per client IP within
    `window_seconds` for the given `bucket` name."""

    async def dependency(request: Request) -> None:
        # Same IP hits the same bucket regardless of browser/incognito state —
        # rate limiting is IP-based, not session-based. Skip it entirely in
        # local dev so repeated manual testing doesn't get locked out;
        # staging/production keep the real limit.
        if settings.ENVIRONMENT == "local":
            return
        key = f"{bucket}:{_client_ip(request)}"
        now = time.monotonic()
        cutoff = now - window_seconds
        timestamps = _buckets[key]
        while timestamps and timestamps[0] < cutoff:
            timestamps.pop(0)
        if len(timestamps) >= limit:
            raise RateLimitedError()
        timestamps.append(now)

    return dependency
