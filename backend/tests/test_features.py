import uuid
from types import SimpleNamespace

import pytest

from app.core.exceptions import QuotaExceededError
from app.modules.tenants import service
from app.modules.tenants.schemas import FeatureOverrideUpdate, TenantLimitsUpdate

FLAG_KEYS = ["inventory", "sales", "finance", "hr", "procurement", "crm", "manufacturing"]


def _flag(key, default_enabled=True):
    return SimpleNamespace(
        key=key, name=key, module=key, description=None,
        default_enabled=default_enabled, is_active=True,
    )


class _FakeTenant:
    def __init__(self, features=None, limits=None):
        self.id = uuid.uuid4()
        self.features = features or {}
        self.limits = limits or {}


class _FakeRepo:
    def __init__(self, tenant):
        self._tenant = tenant
        self.saved = None

    async def get(self, _id):
        return self._tenant

    async def save(self, tenant):
        self.saved = tenant


class _FakeDB:
    """Minimal AsyncSession stand-in: execute returns FeatureFlag rows."""

    def __init__(self, tenant):
        self.tenant = tenant
        self.rows = [_flag(k) for k in FLAG_KEYS]

    async def execute(self, stmt):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self.rows))

    async def commit(self):
        return None


@pytest.mark.asyncio
async def test_effective_features_defaults_when_no_overrides(monkeypatch):
    tenant = _FakeTenant()
    monkeypatch.setattr(service.feature.TenantRepository, "get", _FakeRepo(tenant).get)
    result = await service.get_effective_features(_FakeDB(tenant), tenant.id)
    assert result == {k: True for k in FLAG_KEYS}


@pytest.mark.asyncio
async def test_effective_features_respect_overrides(monkeypatch):
    tenant = _FakeTenant(features={"hr": False, "sales": False})
    monkeypatch.setattr(service.feature.TenantRepository, "get", _FakeRepo(tenant).get)
    result = await service.get_effective_features(_FakeDB(tenant), tenant.id)
    assert result["hr"] is False
    assert result["sales"] is False
    assert result["inventory"] is True


@pytest.mark.asyncio
async def test_set_tenant_features_merges_overrides(monkeypatch):
    tenant = _FakeTenant(features={"hr": False})
    repo = _FakeRepo(tenant)
    monkeypatch.setattr(service.feature.TenantRepository, "get", repo.get)
    monkeypatch.setattr(service.feature.TenantRepository, "save", repo.save)
    db = _FakeDB(tenant)
    states = await service.set_tenant_features(db, tenant.id, FeatureOverrideUpdate(features={"manufacturing": False}))
    assert repo.saved.features == {"hr": False, "manufacturing": False}
    by_key = {s.key: s for s in states}
    assert by_key["manufacturing"].enabled is False
    assert by_key["manufacturing"].overridden is True
    assert by_key["hr"].enabled is False


@pytest.mark.asyncio
async def test_reset_tenant_features_clears_overrides(monkeypatch):
    tenant = _FakeTenant(features={"hr": False, "sales": False})
    repo = _FakeRepo(tenant)
    monkeypatch.setattr(service.feature.TenantRepository, "get", repo.get)
    monkeypatch.setattr(service.feature.TenantRepository, "save", repo.save)
    db = _FakeDB(tenant)
    states = await service.reset_tenant_features(db, tenant.id)
    assert repo.saved.features == {}
    assert all(s.overridden is False for s in states)
    assert all(s.enabled is s.default_enabled for s in states)


@pytest.mark.asyncio
async def test_limit_unset_means_unlimited(monkeypatch):
    tenant = _FakeTenant(limits={})
    monkeypatch.setattr(service.feature.TenantRepository, "get", _FakeRepo(tenant).get)
    db = _FakeDB(tenant)
    await service.enforce_limit(db, tenant.id, "max_users", current_count=50, noun="user")


@pytest.mark.asyncio
async def test_limit_reached_raises_quota_exceeded(monkeypatch):
    tenant = _FakeTenant(limits={"max_users": 5})
    monkeypatch.setattr(service.feature.TenantRepository, "get", _FakeRepo(tenant).get)
    db = _FakeDB(tenant)
    with pytest.raises(QuotaExceededError):
        await service.enforce_limit(db, tenant.id, "max_users", current_count=5, noun="user")


@pytest.mark.asyncio
async def test_limit_allows_at_below_cap(monkeypatch):
    tenant = _FakeTenant(limits={"max_products": 10})
    monkeypatch.setattr(service.feature.TenantRepository, "get", _FakeRepo(tenant).get)
    db = _FakeDB(tenant)
    await service.enforce_limit(db, tenant.id, "max_products", current_count=9, noun="product")


@pytest.mark.asyncio
async def test_set_tenant_limits_round_trips(monkeypatch):
    tenant = _FakeTenant(limits={})
    repo = _FakeRepo(tenant)
    monkeypatch.setattr(service.feature.TenantRepository, "get", repo.get)
    monkeypatch.setattr(service.feature.TenantRepository, "save", repo.save)
    db = _FakeDB(tenant)
    updated = await service.set_tenant_limits(
        db, tenant.id, TenantLimitsUpdate(max_users=25, max_products=1000, max_storage_mb=None)
    )
    assert updated.max_users == 25
    assert updated.max_products == 1000
    assert updated.max_storage_mb is None
    assert repo.saved.limits == {"max_users": 25, "max_products": 1000, "max_branches": None, "max_storage_mb": None}
