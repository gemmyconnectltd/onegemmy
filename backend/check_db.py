import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1 AS test"))
            print("DB connected OK")

            tables = await conn.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
            )
            rows = tables.all()
            if rows:
                print(f"Tables found ({len(rows)}): {[r[0] for r in rows]}")
            else:
                print("No tables yet — need to run migrations")
    except Exception as e:
        print(f"DB error: {e}")
    finally:
        await engine.dispose()


asyncio.run(main())
