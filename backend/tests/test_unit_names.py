"""One unit per name in a business: a second "Piece" (any case or spacing) is refused, by the API and by the database."""
import pytest
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.modules.inventory.models.unit import Unit
from tests.test_sales_team import API, team


@pytest.mark.db
async def test_duplicate_unit_names_are_refused(db, monkeypatch):
    tenant, _ann, _ben, owner, client, _sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            assert (await c.post(f"{API}/inventory/units", json={"name": "Piece", "abbreviation": "pcs"})).status_code == 201
            again = await c.post(f"{API}/inventory/units", json={"name": " piece ", "abbreviation": "pc"})
            assert again.status_code == 409 and "already exists" in again.text
            box = (await c.post(f"{API}/inventory/units", json={"name": "Box"})).json()["data"]
            assert (await c.patch(f"{API}/inventory/units/{box['id']}", json={"name": "PIECE"})).status_code == 409
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                db.add(Unit(tenant_id=tenant.id, name="piece"))
                await db.flush()
    finally:
        app.dependency_overrides.clear()
