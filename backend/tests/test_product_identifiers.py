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
    products = [service._product_with_sku(tenant_id, data.model_dump()) for _ in range(50)]
    assert len({p.sku for p in products}) == 50
    assert all(p.sku == f"PRD-{p.id.hex.upper()}" for p in products)
    assert all(p.tenant_id == tenant_id for p in products)
    assert products[0].barcode == "001234"
    assert products[0].subcategory == "Rice"


def test_manual_sku_is_preserved(monkeypatch):
    monkeypatch.setattr(service, "Product", SimpleNamespace)
    data = ProductCreate(name="Rice", sku=" RICE-001 ")
    product = service._product_with_sku(uuid.uuid4(), data.model_dump())
    assert product.sku == "RICE-001"


@pytest.mark.parametrize("field,limit", [("sku", 100), ("barcode", 100), ("subcategory", 255)])
@pytest.mark.parametrize("schema", [ProductCreate, ProductUpdate])
def test_identifier_lengths_are_validated(field, limit, schema):
    with pytest.raises(ValidationError):
        schema(name="Rice", **{field: "x" * (limit + 1)})


@pytest.mark.parametrize("existing_sku", ["RICE-001", None])
async def test_blank_sku_update_preserves_or_generates(monkeypatch, existing_sku):
    tenant_id, product_id = uuid.uuid4(), uuid.uuid4()
    product = SimpleNamespace(id=product_id, sku=existing_sku)
    repo = SimpleNamespace(
        get_by_id_for_tenant=AsyncMock(return_value=product),
        save=AsyncMock(return_value=product),
    )
    monkeypatch.setattr(service, "ProductRepository", lambda db: repo)
    monkeypatch.setattr(service, "ProductRead", SimpleNamespace(model_validate=lambda obj: obj))
    db = SimpleNamespace(commit=AsyncMock())
    result = await service.update_product(
        db, tenant_id, product_id, ProductUpdate(sku=" ", barcode="001234", subcategory="Rice")
    )
    assert result.sku == (existing_sku or f"PRD-{product_id.hex.upper()}")
    assert result.barcode == "001234"
    assert result.subcategory == "Rice"
    repo.get_by_id_for_tenant.assert_called_with(tenant_id, product_id)
    db.commit.assert_awaited_once()


async def test_failed_bulk_row_keeps_successful_products(monkeypatch):
    from app.core.exceptions import ValidationError as AppValidationError

    saved = []

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
    db.rollback.assert_not_awaited()
    db.commit.assert_awaited_once()
