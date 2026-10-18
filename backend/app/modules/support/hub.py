"""In-process fan-out of support events to connected staff (Server-Sent Events).

Pesaa has no real-time infrastructure (no websockets, queue or Redis), so this keeps it simple: each open
`/support/stream` connection owns an asyncio queue and `publish()` pushes into the queues allowed to see the event.
It lives in one process's memory — correct for a single backend instance; running several workers needs a shared
bus (Redis pub/sub) behind this same interface. Events never carry message text, only ids and counters; the client
refetches through the normal, authorized API."""
import asyncio
import uuid
from dataclasses import dataclass, field

MANAGER_ROLES = {"superadmin", "support_manager"}


@dataclass(eq=False)
class _Subscriber:
    user_id: uuid.UUID
    role: str
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=100))


_subscribers: set[_Subscriber] = set()


def subscribe(user_id: uuid.UUID, role: str) -> _Subscriber:
    sub = _Subscriber(user_id, role)
    _subscribers.add(sub)
    return sub


def unsubscribe(sub: _Subscriber) -> None:
    _subscribers.discard(sub)


def publish(event: dict, *, assigned_to: uuid.UUID | None = None, only_user: uuid.UUID | None = None) -> None:
    """`assigned_to` scopes the event the way the inbox is scoped: managers see everything, an agent sees events
    for unassigned conversations and ones assigned to them. `only_user` targets exactly one person."""
    for sub in list(_subscribers):
        if only_user is not None and sub.user_id != only_user:
            continue
        if only_user is None and sub.role not in MANAGER_ROLES and assigned_to not in (None, sub.user_id):
            continue
        try:
            sub.queue.put_nowait(event)
        except asyncio.QueueFull:  # a stalled client must never block the publisher; it resyncs on reconnect
            pass
