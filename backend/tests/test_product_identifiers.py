import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.modules.inventory.schemas.product import (
    ProductBulkCreate,
    ProductBulkLine,
    ProductCreate,
    ProductUpdate,
)
from app.modules.inventory.service import product as service


@pytest.mark.parametrize("sku", [None, "", "   "])
def test_blank_sku_generates_unique_identifiers(monkeypatch, sku):
    monkeypatch.setattr(service, "Product", SimpleNamespace)
    tenant_id = uuid.uuid4()
    data = ProductCreate(name="Rice", sku=sku, barcode=" 001234 ", subcategory=" Rice ")
    products = [service._product_with_sku(tenant_id, data.model_dump(), n) for n in range(1, 51)]
    assert len({p.sku for p in products}) == 50
    assert [p.sku for p in products[:2]] == ["PRD-00001", "PRD-00002"]  # short and sequential
    assert all(p.tenant_id == tenant_id for p in products)
    assert products[0].barcode == "001234"
    assert products[0].subcategory == "Rice"


def test_manual_sku_is_preserved(monkeypatch):
    monkeypatch.setattr(service, "Product", SimpleNamespace)
    data = ProductCreate(name="Rice", sku=" RICE-001 ")
    product = service._product_with_sku(uuid.uuid4(), data.model_dump(), 7)
    assert product.sku == "RICE-001"


@pytest.mark.parametrize("field,limit", [("sku", 100), ("barcode", 100), ("subcategory", 255)])
@pytest.mark.parametrize("schema", [ProductCreate, ProductUpdate])
def test_identifier_lengths_are_validated(field, limit, schema):
    with pytest.raises(ValidationError):
        schema(name="Rice", **{field: "x" * (limit + 1)})


@pytest.mark.parametrize("existing_sku", ["RICE-001", None])
async def test_blank_sku_update_preserves_or_generates(monkeypatch, existing_sku):
    tenant_id, product_id = uuid.uuid4(), uuid.uuid4()
    product = SimpleNamespace(id=product_id, tenant_id=tenant_id, sku=existing_sku, barcode=None, subcategory=None, price=0, promo_price=None, stock=0)
    from app.modules.approvals import service as approvals
    monkeypatch.setattr(approvals, "exempt_fields", AsyncMock(return_value=set()))
    monkeypatch.setattr(service, "record_product_change", AsyncMock())
    repo = SimpleNamespace(
        lock_stock=AsyncMock(),
        get_by_id_for_tenant=AsyncMock(return_value=product),
        save=AsyncMock(return_value=product),
    )
    monkeypatch.setattr(service, "ProductRepository", lambda db: repo)
    monkeypatch.setattr(service, "ProductRead", SimpleNamespace(model_validate=lambda obj: obj))
    monkeypatch.setattr(service, "_last_sku_number", AsyncMock(return_value=41))
    db = SimpleNamespace(commit=AsyncMock())
    result = await service.update_product(
        db, tenant_id, product_id, ProductUpdate(sku=" ", barcode="001234", subcategory="Rice")
    )
    assert result.sku == (existing_sku or "PRD-00042")
    assert result.barcode == "001234"
    assert result.subcategory == "Rice"
    repo.get_by_id_for_tenant.assert_called_with(tenant_id, product_id)
    db.commit.assert_awaited_once()


async def test_failed_bulk_row_keeps_successful_products(monkeypatch):
    from app.core.exceptions import ValidationError as AppValidationError

    saved = []
    monkeypatch.setattr(service, "record_product_change", AsyncMock())

    @asynccontextmanager
    async def savepoint():
        before = len(saved)
        try:
            yield
        except AppValidationError:
            del saved[before:]
            raise

    async def save(product):
        saved.append(product)
        return product

    monkeypatch.setattr(service, "Product", SimpleNamespace)
    monkeypatch.setattr(service, "ProductRepository", lambda db: SimpleNamespace(save=save))
    monkeypatch.setattr(service, "_tenant_industry", AsyncMock(return_value=None))
    monkeypatch.setattr(service, "count_products", AsyncMock(return_value=10))
    monkeypatch.setattr(service, "_last_sku_number", AsyncMock(return_value=0))
    limit = AsyncMock()
    monkeypatch.setattr("app.modules.tenants.service.enforce_limit", limit)
    monkeypatch.setattr(service, "BatchRepository", lambda db: SimpleNamespace(
        get_by_batch_number=AsyncMock(return_value=object()),
    ))
    db = SimpleNamespace(begin_nested=savepoint, commit=AsyncMock(), rollback=AsyncMock())
    result = await service.bulk_create_products(db, uuid.uuid4(), ProductBulkCreate(items=[
        ProductBulkLine(name="First", sku=""),
        ProductBulkLine(name="Invalid batch", batch_number="DUPLICATE"),
        ProductBulkLine(name="Last", sku=None),
    ]))
    assert result.created == 2
    assert result.failed == 1
    assert [p.name for p in saved] == ["First", "Last"]
    assert len({p.sku for p in saved}) == 2
    # each row's new id in order, None for the failed row, so pictures follow their own row
    assert result.ids == [saved[0].id, None, saved[1].id]
    # the plan limit is checked for the whole batch: 10 existing + 3 new must fit
    assert limit.await_args.args[2:] == ("max_products", 12)
    db.rollback.assert_not_awaited()
    db.commit.assert_awaited_once()
