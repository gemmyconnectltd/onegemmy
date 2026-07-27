import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


class BaseRepository[ModelT]:
    """Base for per-module repositories: owns all direct DB access for one model.

    Services call repositories instead of building queries themselves, so
    query logic stays out of business logic and is easy to find/reuse.
    """

    model: type[ModelT]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, id: uuid.UUID) -> ModelT | None:
        return await self.db.get(self.model, id)

    async def save(self, obj: ModelT) -> ModelT:
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.db.delete(obj)
        await self.db.commit()

    async def count(self, *filters) -> int:
        stmt = select(func.count()).select_from(self.model)
        for f in filters:
            stmt = stmt.where(f)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def list(self, offset: int = 0, limit: int = 20, *filters) -> list[ModelT]:
        stmt = select(self.model)
        for f in filters:
            stmt = stmt.where(f)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
