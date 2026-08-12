import json
import uuid

import pytest

from app.core.exceptions import NotFoundError
from app.modules.admin import routes


class _FakeUser:
    def __init__(self, user_id, tenant_id, is_superuser=False):
        self.id = user_id
        self.tenant_id = tenant_id
        self.is_superuser = is_superuser
        self.email = "user@example.com"
        self.full_name = "Test User"
        self.hashed_password = "old-hash"


class _FakeAdmin:
    def __init__(self):
        self.id = uuid.uuid4()
        self.email = "superadmin@onegemmy.com"
        self.full_name = "Super Admin"


class _FakeDB:
    def __init__(self, user):
        self._user = user
        self.committed = False
        self.added = []

    async def get(self, _model, user_id):
        return self._user if self._user and self._user.id == user_id else None

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        return None

    async def commit(self):
        self.committed = True


async def _call(monkeypatch, user, tenant_id, user_id):
    saved = []
    async def fake_save(self, u):
        saved.append(u)
        return u
    monkeypatch.setattr("app.modules.admin.routes.UserRepository.save", fake_save)
    db = _FakeDB(user)
    res = await routes.admin_reset_tenant_user_password(tenant_id, user_id, db, _FakeAdmin())
    return res, db, saved


@pytest.mark.asyncio
async def test_reset_tenant_user_password_sets_new_hash(monkeypatch):
    uid, tid = uuid.uuid4(), uuid.uuid4()
    user = _FakeUser(uid, tid)

    res, db, saved = await _call(monkeypatch, user, tid, uid)

    assert res.status_code == 200
    body = json.loads(res.body)
    assert body["success"] is True
    assert body["data"]["temp_password"]
    assert len(body["data"]["temp_password"]) >= 12
    assert db.committed is True
    assert saved and saved[0].hashed_password != "old-hash"


@pytest.mark.asyncio
async def test_reset_tenant_user_password_audits(monkeypatch):
    uid, tid = uuid.uuid4(), uuid.uuid4()
    user = _FakeUser(uid, tid)

    res, db, _ = await _call(monkeypatch, user, tid, uid)

    assert db.committed is True
    assert len(db.added) >= 1
    assert db.added[-1].action == "user.password_reset"
    assert db.added[-1].entity_id == str(uid)


@pytest.mark.asyncio
async def test_reset_tenant_user_password_rejects_wrong_tenant(monkeypatch):
    uid = uuid.uuid4()
    user = _FakeUser(uid, uuid.uuid4())
    other_tenant = uuid.uuid4()

    with pytest.raises(NotFoundError):
        await _call(monkeypatch, user, other_tenant, uid)


@pytest.mark.asyncio
async def test_reset_tenant_user_password_rejects_missing_user(monkeypatch):
    tid = uuid.uuid4()
    with pytest.raises(NotFoundError):
        await _call(monkeypatch, None, tid, uuid.uuid4())
