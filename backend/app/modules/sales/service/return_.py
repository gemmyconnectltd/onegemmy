import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.finance.service.transaction import create_return_transaction
from app.modules.sales.models.return_ import Return
from app.modules.sales.models.return_item import ReturnItem
from app.modules.sales.repository import ReturnRepository
from app.modules.sales.schemas import ReturnCreate, ReturnRead, ReturnUpdate


async def list_returns(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[ReturnRead]:
    items = await ReturnRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [ReturnRead.model_validate(i) for i in items]


async def count_returns(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await ReturnRepository(db).count_for_tenant(tenant_id, status)


async def get_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ReturnRead:
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    return ReturnRead.model_validate(obj)


async def create_return(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: ReturnCreate) -> ReturnRead:
    repo = ReturnRepository(db)
    return_number = await repo.next_return_number(tenant_id)
    refund_amount = sum(item.line_refund for item in data.items)

    ret = Return(
        tenant_id=tenant_id,
        return_number=return_number,
        order_id=data.order_id,
        customer_id=data.customer_id,
        reason=data.reason,
        refund_amount=refund_amount,
        status=data.status,
        return_date=data.return_date,
        processed_by=user_id if data.status != "Pending" else None,
    )
    ret = await repo.save(ret)

    for item_data in data.items:
        item = ReturnItem(
            return_id=ret.id,
            order_item_id=item_data.order_item_id,
            product_id=item_data.product_id,
            product_name=item_data.product_name,
            quantity=item_data.quantity,
            refund_per_unit=item_data.refund_per_unit,
            line_refund=item_data.line_refund,
        )
        db.add(item)

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, ret.id)
    return ReturnRead.model_validate(obj)


async def update_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, data: ReturnUpdate) -> ReturnRead:
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    updates = data.model_dump(exclude_unset=True)
    # auto-set processed_by when status moves from Pending
    if "status" in updates and updates["status"] != "Pending" and obj.processed_by is None:
        updates.setdefault("processed_by", user_id)
    was_approved = obj.status == "Approved"
    for field, value in updates.items():
        setattr(obj, field, value)
    await ReturnRepository(db).save(obj)
    # auto-create finance transaction when status flips to Approved
    if not was_approved and obj.status == "Approved":
        await create_return_transaction(
            db, tenant_id, user_id, obj.id, float(obj.refund_amount), obj.return_number
        )
    await db.commit()
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ReturnRead.model_validate(obj)


async def delete_return(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ReturnRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Return not found")
    await ReturnRepository(db).delete(obj)
    await db.commit()
