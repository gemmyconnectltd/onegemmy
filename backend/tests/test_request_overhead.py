"""Per-request overhead stays flat: authenticating a person and deciding which modules their business has costs the same
few queries however large the business is, module states are worked out once per request, and nothing remembered for one
request or business is ever used for another."""
import uuid
from contextlib import contextmanager

import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants import service
from app.modules.tenants.models import Branch, Department, Permission, Role, Tenant, User
from app.modules.tenants.service.feature import LIMIT_KEYS
from app.modules.tenants.service.user import get_user_by_id_raw

pytestmark = pytest.mark.db


@contextmanager
def queries(db: AsyncSession):
    """Counts SQL statements sent on this session's connection while the block runs."""
    seen: list[str] = []
    engine = db.bind.sync_engine if hasattr(db.bind, "sync_engine") else db.bind.engine.sync_engine

    def count(_conn, _cursor, statement, *_args):
        seen.append(statement)
    event.listen(engine, "before_cursor_execute", count)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", count)


async def big_business(db, staff: int = 25):
    tenant = Tenant(name="Big", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    grants = (await db.execute(select(Permission).limit(40))).scalars().all()
    roles = [Role(tenant_id=tenant.id, name=f"Role {i}", permissions=list(grants)) for i in range(5)]
    db.add_all([*roles, *(Branch(tenant_id=tenant.id, name=f"Branch {i}") for i in range(5)),
                *(Department(tenant_id=tenant.id, name=f"Department {i}") for i in range(5))])
    await db.flush()
    people = [User(tenant_id=tenant.id, email=f"{uuid.uuid4()}@example.test", hashed_password="x", full_name=f"Person {i}",
                   role_id=roles[i % 5].id) for i in range(staff)]
    db.add_all(people)
    await db.flush()
    db.expunge_all()
    return tenant, people[0], grants


async def test_authentication_is_two_queries_and_never_loads_the_rest_of_the_business(db):
    tenant, person, grants = await big_business(db)
    with queries(db) as sent:
        user = await get_user_by_id_raw(db, tenant.id, person.id)
    assert len(sent) == 2  # the user with its tenant, role and branch; then the role's permissions
    assert user.tenant.id == tenant.id and {p.name for p in user.role_rel.permissions} == {g.name for g in grants}
    loaded_people = [obj for obj in db.identity_map.values() if isinstance(obj, User)]
    assert loaded_people == [user]  # not the other 24 people, nor the business's other roles, branches or departments
    assert not any(isinstance(obj, (Branch, Department)) for obj in db.identity_map.values())


async def test_a_revoked_permission_applies_on_the_next_request(db):
    tenant, person, grants = await big_business(db, staff=1)
    role = (await db.execute(select(Role).where(Role.tenant_id == tenant.id, Role.id == person.role_id))).scalar_one()
    revoked = grants[0].name
    role.permissions = [p for p in role.permissions if p.name != revoked]
    await db.flush()
    async with AsyncSession(bind=db.bind, join_transaction_mode="create_savepoint") as next_request:
        user = await get_user_by_id_raw(next_request, tenant.id, person.id)
        assert revoked not in user.permissions_names


async def test_module_states_are_worked_out_once_per_request(db):
    tenant, _, _ = await big_business(db, staff=1)
    first = await service.resolve_modules(db, tenant.id)
    with queries(db) as sent:
        again = await service.resolve_modules(db, tenant.id)
        features = await service.get_effective_features(db, tenant.id)
    assert again == first and sent == []
    assert features["inventory"] == (first["inventory"] == "enabled")
    again["inventory"] = "tampered"  # callers get a copy, never the remembered states themselves
    assert (await service.resolve_modules(db, tenant.id))["inventory"] == first["inventory"]


async def test_changing_a_business_module_is_seen_at_once_in_the_same_request(db):
    tenant, _, _ = await big_business(db, staff=1)
    assert (await service.resolve_modules(db, tenant.id))["accounting"] == "enabled"
    business = await db.get(Tenant, tenant.id)
    business.module_activation = {"accounting": False}  # not even flushed yet
    assert (await service.resolve_modules(db, tenant.id))["accounting"] == "available"
    business.features = {"hr": False}
    await db.flush()
    states = await service.resolve_modules(db, tenant.id)
    assert states["hr"] == "restricted" and states["accounting"] == "available"
    await service.set_module_activation(db, tenant.id, "accounting", True)
    assert (await service.resolve_modules(db, tenant.id))["accounting"] == "enabled"


async def test_one_business_never_sees_anothers_module_states(db):
    open_shop = Tenant(name="Open", slug=uuid.uuid4().hex)
    closed_shop = Tenant(name="Closed", slug=uuid.uuid4().hex, features={"sales": False})
    db.add_all([open_shop, closed_shop])
    await db.flush()
    assert (await service.resolve_modules(db, open_shop.id))["sales"] == "enabled"
    assert (await service.resolve_modules(db, closed_shop.id))["sales"] == "restricted"
    assert (await service.resolve_modules(db, open_shop.id))["sales"] == "enabled"
    async with AsyncSession(bind=db.bind, join_transaction_mode="create_savepoint") as other_request:
        assert other_request.info == {}  # a new request starts with nothing remembered


async def test_entitlements_read_the_subscription_once_for_all_limits(db):
    tenant, _, _ = await big_business(db, staff=1)
    with queries(db) as sent:
        limits = await service.get_tenant_limits(db, tenant.id)
    assert sum("billing_subscriptions" in s for s in sent) == 1
    assert set(limits.model_dump()) == set(LIMIT_KEYS)
