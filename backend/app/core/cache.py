"""Tiny in-process TTL cache for expensive, read-only aggregate endpoints.

Deliberately minimal (no Redis dependency): each worker process keeps its own
entries, which is fine for platform-admin analytics where a few seconds/minutes
of staleness is acceptable. Concurrent callers for the same key share a single
computation (single-flight) so a cold cache never stampedes the database.

Never use this for tenant-facing or consistency-critical data. Call
`invalidate_cache(namespace)` after writes that should be visible immediately.
"""
import asyncio
import time
from collections.abc import Awaitable, Callable, Hashable
from functools import wraps
from typing import Any

_MAX_ENTRIES = 512

# namespace -> key -> (expires_at_monotonic, value)
_store: dict[str, dict[Hashable, tuple[float, Any]]] = {}
_locks: dict[tuple[str, Hashable], asyncio.Lock] = {}


def invalidate_cache(namespace: str | None = None) -> None:
    """Drop every entry in `namespace` (or all namespaces when None)."""
    if namespace is None:
        _store.clear()
    else:
        _store.pop(namespace, None)


def _evict_if_full(bucket: dict[Hashable, tuple[float, Any]]) -> None:
    if len(bucket) < _MAX_ENTRIES:
        return
    now = time.monotonic()
    for key in [k for k, (exp, _) in bucket.items() if exp <= now]:
        bucket.pop(key, None)
    while len(bucket) >= _MAX_ENTRIES:
        bucket.pop(next(iter(bucket)))  # oldest insertion first


def ttl_cache[**P, R](
    namespace: str, ttl_seconds: float | Callable[..., float],
) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    """Cache an async function's result per (args, kwargs) for `ttl_seconds`.

    `ttl_seconds` may be a callable receiving the same arguments as the cached
    function, so e.g. historical ranges can be cached longer than live ones.

    Arguments must be hashable and must not include per-request objects such as
    DB sessions — the cached function should open its own session.
    """
    def decorator(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @wraps(fn)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            key: Hashable = (fn.__qualname__, args, tuple(sorted(kwargs.items())))
            bucket = _store.setdefault(namespace, {})
            hit = bucket.get(key)
            if hit is not None and hit[0] > time.monotonic():
                return hit[1]

            lock = _locks.setdefault((namespace, key), asyncio.Lock())
            async with lock:
                bucket = _store.setdefault(namespace, {})
                hit = bucket.get(key)
                if hit is not None and hit[0] > time.monotonic():
                    return hit[1]
                try:
                    value = await fn(*args, **kwargs)
                    _evict_if_full(bucket)
                    ttl = ttl_seconds(*args, **kwargs) if callable(ttl_seconds) else ttl_seconds
                    bucket[key] = (time.monotonic() + ttl, value)
                    return value
                finally:
                    _locks.pop((namespace, key), None)
        return wrapper
    return decorator
