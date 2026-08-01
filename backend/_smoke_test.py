import asyncio
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.modules.sales.schemas import OrderCreate, OrderItemCreate
from app.modules.sales.service.order import create_order, delete_order, get_order

VARIANT_ID = uuid.UUID("15effcad-5666-42f8-920d-27c0ad3f2c35")
PRODUCT_ID = uuid.UUID("9394d850-f633-4ab6-8d73-9dbf6bc8ce13")
TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
USER_ID = uuid.UUID("6a4fdebd-be0c-4241-9d1d-ff582cab54d7")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # 1) variant order — should resolve name/sku/attributes from DB
        o = await create_order(db, TENANT_ID, USER_ID, OrderCreate(
            status="Pending",
            discount=0, tax=0, notes="smoke-test",
            items=[OrderItemCreate(
                product_id=PRODUCT_ID, variant_id=VARIANT_ID,
                product_name="ignored", sku=None, variant_attributes=None,
                unit_price=2000, quantity=1, discount=0,
            )],
        ))
        read = await get_order(db, TENANT_ID, o.id)
        it = read.items[0]
        print("1. variant order: product_name=%r sku=%r attrs=%r" % (it.product_name, it.sku, it.variant_attributes))
        assert it.product_name == "Macbook pro"
        assert it.variant_id == VARIANT_ID
        assert it.variant_attributes == {}

        # 2) item with neither id — must raise ValidationError
        try:
            await create_order(db, TENANT_ID, USER_ID, OrderCreate(
                status="Pending", discount=0, tax=0, notes="bad",
                items=[OrderItemCreate(
                    product_id=None, variant_id=None,
                    product_name="manual", sku=None, variant_attributes=None,
                    unit_price=5, quantity=1, discount=0,
                )],
            ))
            raise SystemExit("FAIL: no-id item accepted")
        except Exception as e:
            print("2. no-id item -> %s" % type(e).__name__)

        # cleanup
        await delete_order(db, TENANT_ID, o.id)
        print("cleaned up OK")

    await engine.dispose()


asyncio.run(main())
