import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.modules.sales.schemas import OrderCreate, OrderItemCreate
from app.modules.sales.service.order import create_order

VARIANT_ID = uuid.UUID("15effcad-5666-42f8-920d-27c0ad3f2c35")
PRODUCT_ID = uuid.UUID("9394d850-f633-4ab6-8d73-9dbf6bc8ce13")
TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
USER_ID = uuid.UUID("6a4fdebd-be0c-4241-9d1d-ff582cab54d7")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    before = None
    async with Session() as db:
        before = (await db.execute(text(
            "SELECT stock FROM inventory_product_variants WHERE id=:id"
        ), {"id": VARIANT_ID})).scalar()

    async with Session() as db:
        try:
            await create_order(db, TENANT_ID, USER_ID, OrderCreate(
                status="Completed", discount=0, tax=0, notes="smoke",
                items=[OrderItemCreate(
                    product_id=PRODUCT_ID, variant_id=VARIANT_ID,
                    product_name="x", sku=None, variant_attributes=None,
                    unit_price=2000, quantity=999999, discount=0,
                )],
            ))
            raise SystemExit("FAIL: oversell accepted")
        except Exception as e:
            print("oversell -> %s: %s" % (type(e).__name__, e))

    async with Session() as db:
        after = (await db.execute(text(
            "SELECT stock FROM inventory_product_variants WHERE id=:id"
        ), {"id": VARIANT_ID})).scalar()
        leftover = (await db.execute(text(
            "SELECT count(*) FROM sales_orders WHERE notes='smoke'"
        ))).scalar()

    print("stock before=%s after=%s (must be equal)" % (before, after))
    print("leftover smoke orders=%s (must be 0)" % leftover)
    assert before == after
    assert leftover == 0

    await engine.dispose()


asyncio.run(main())
