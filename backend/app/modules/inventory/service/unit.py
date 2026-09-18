import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.inventory.models.unit import Unit
from app.modules.inventory.repository import UnitRepository
from app.modules.inventory.schemas import (
    UnitCreate,
    UnitImportResult,
    UnitRead,
    UnitSuggestion,
    UnitSuggestionsRead,
    UnitUpdate,
)

# Generic starter units — unlike categories these don't vary by industry,
# so there's a single flat list rather than a template library.
COMMON_UNITS: list[dict] = [
    {"name": "Piece", "abbreviation": "pcs"},
    {"name": "Kilogram", "abbreviation": "kg"},
    {"name": "Gram", "abbreviation": "g"},
    {"name": "Litre", "abbreviation": "L"},
    {"name": "Millilitre", "abbreviation": "mL"},
    {"name": "Box", "abbreviation": "box"},
    {"name": "Carton", "abbreviation": "ctn"},
    {"name": "Dozen", "abbreviation": "dz"},
    {"name": "Pack", "abbreviation": "pack"},
    {"name": "Bag", "abbreviation": "bag"},
    {"name": "Bottle", "abbreviation": "btl"},
    {"name": "Roll", "abbreviation": "roll"},
    {"name": "Pair", "abbreviation": "pr"},
    {"name": "Meter", "abbreviation": "m"},
    {"name": "Set", "abbreviation": "set"},
    {"name": "Bundle", "abbreviation": "bdl"},
    {"name": "Sack", "abbreviation": "sack"},
    {"name": "Tray", "abbreviation": "tray"},
]


async def get_unit(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> UnitRead:
    obj = await UnitRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Unit not found")
    return UnitRead.model_validate(obj)


async def list_units(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[UnitRead]:
    items = await UnitRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [UnitRead.model_validate(i) for i in items]


async def count_units(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await UnitRepository(db).count_for_tenant(tenant_id)


async def create_unit(db: AsyncSession, tenant_id: uuid.UUID, data: UnitCreate) -> UnitRead:
    obj = Unit(tenant_id=tenant_id, **data.model_dump())
    obj = await UnitRepository(db).save(obj)
    await db.commit()
    return UnitRead.model_validate(obj)


async def update_unit(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: UnitUpdate) -> UnitRead:
    obj = await UnitRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Unit not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await UnitRepository(db).save(obj)
    await db.commit()
    return UnitRead.model_validate(obj)


async def delete_unit(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await UnitRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Unit not found")
    await UnitRepository(db).delete(obj)
    await db.commit()


async def get_unit_suggestions(db: AsyncSession, tenant_id: uuid.UUID) -> UnitSuggestionsRead:
    existing = await UnitRepository(db).list_all_for_tenant(tenant_id)
    existing_names_lower = {u.name.strip().lower() for u in existing}

    return UnitSuggestionsRead(
        suggested=[UnitSuggestion(**u) for u in COMMON_UNITS if u["name"].lower() not in existing_names_lower],
        existing=[u.name for u in existing],
    )


async def import_units(db: AsyncSession, tenant_id: uuid.UUID, units: list[UnitSuggestion]) -> UnitImportResult:
    existing = await UnitRepository(db).list_all_for_tenant(tenant_id)
    existing_names_lower = {u.name.strip().lower() for u in existing}

    created: list[UnitRead] = []
    skipped: list[str] = []
    for suggestion in units:
        name = suggestion.name.strip()
        if not name or name.lower() in existing_names_lower:
            skipped.append(suggestion.name)
            continue
        obj = Unit(tenant_id=tenant_id, name=name, abbreviation=suggestion.abbreviation or None)
        obj = await UnitRepository(db).save(obj)
        created.append(UnitRead.model_validate(obj))
        existing_names_lower.add(name.lower())

    await db.commit()
    return UnitImportResult(created=created, skipped=skipped)
