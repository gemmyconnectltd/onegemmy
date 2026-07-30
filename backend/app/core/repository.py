import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError


class BaseRepository[ModelT]:
    model: type[ModelT]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, id: uuid.UUID) -> ModelT | None:
        return await self.db.get(self.model, id)

    async def save(self, obj: ModelT) -> ModelT:
        try:
            self.db.add(obj)
            await self.db.flush()
            await self.db.refresh(obj)
            return obj
        except IntegrityError as e:
            raise ConflictError("Resource already exists") from e

    async def delete(self, obj: ModelT) -> None:
        await self.db.delete(obj)
        await self.db.flush()

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
