"""Import engine endpoints. All are read-only helpers for reviewing an import; records are created only by each module's
own bulk endpoint after the person approves the rows. Every query is scoped to the signed-in person's business."""
import json
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.core.access import require_module_write
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.response import success_response
from app.modules.imports import service

# Each import is allowed exactly when the person may use that module's own bulk import: the same access rule decides.
BULK_ENDPOINTS = {
    "products": ("inventory", "/inventory/products/bulk"),
    "suppliers": ("inventory", "/inventory/suppliers/bulk"),
    "customers": ("sales", "/sales/customers/bulk"),
    "sales": ("sales", "/sales/orders/bulk"),
    "expenses": ("accounting", "/accounting/expenses/bulk"),
    "accounts": ("accounting", "/accounting/workspace/accounts/import"),
}


async def may_import(user, module: str) -> bool:
    target = BULK_ENDPOINTS.get(module)
    if target is None:
        return False
    try:
        await require_module_write(target[0])(SimpleNamespace(method="POST", url=SimpleNamespace(path=f"/api/v1/tenants{target[1]}")), user)
    except ForbiddenError:
        return False
    return True


async def _can_import_something(user: CurrentUser) -> None:
    if not user.tenant_id:
        raise ForbiddenError("Imports belong to a business account")
    for module in BULK_ENDPOINTS:
        if await may_import(user, module):
            return
    raise ForbiddenError("You don't have permission to import records. Ask an administrator of your business.")


async def _require(user, module: str) -> None:
    if not await may_import(user, module):
        raise ForbiddenError("You don't have permission to import these records. Ask an administrator of your business.")


router = APIRouter(prefix="/imports", tags=["Imports"], dependencies=[Depends(_can_import_something)])


def _tenant(user) -> Any:
    if not user.tenant_id:
        raise ForbiddenError("Imports belong to a business account")
    return user.tenant_id


class CheckRequest(BaseModel):
    module: str
    rows: list[dict[str, Any]] = Field(max_length=service.MAX_ROWS)


class FieldSpec(BaseModel):
    key: str = Field(max_length=60)
    label: str = Field(default="", max_length=80)


class MappingRequest(BaseModel):
    module: str
    fields: list[FieldSpec] = Field(max_length=40)
    columns: list[dict[str, Any]] = Field(max_length=60)


@router.get("/ai")
async def ai_status(user: CurrentUser):
    _tenant(user)
    return success_response(data=service.ai_capabilities(), message="Import assistance")


@router.post("/check")
async def check_rows(data: CheckRequest, db: DbSession, user: CurrentUser):
    await _require(user, data.module)
    results = await service.check(db, _tenant(user), data.module, data.rows)
    return success_response(data=results, message="Rows checked")


@router.post("/sheet-pictures")
async def sheet_pictures(user: CurrentUser, file: UploadFile = File(...)):
    await _require(user, "products")
    content = await file.read(60 * 1024 * 1024 + 1)
    if len(content) > 60 * 1024 * 1024:
        raise ValidationError("The file is larger than 60MB")
    return success_response(data=service.sheet_picture_previews(content), message="Pictures read")


@router.post("/extract")
async def extract(db: DbSession, user: CurrentUser, file: UploadFile = File(...), module: str = Form(...), fields: str = Form(...)):
    try:
        specs = [FieldSpec.model_validate(f).model_dump() for f in json.loads(fields)][:40]
    except (ValueError, TypeError) as exc:
        raise ValidationError("fields must be a list of {key, label}") from exc
    await _require(user, module)
    content = await file.read(service.MAX_SOURCE_BYTES + 1)
    result = await service.extract(db, _tenant(user), user.id, module, specs, content, file.content_type or "", file.filename or "")
    return success_response(data=result, message=f"{len(result['rows'])} rows read")


@router.post("/suggest-mapping")
async def suggest_mapping(data: MappingRequest, db: DbSession, user: CurrentUser):
    await _require(user, data.module)
    result = await service.suggest_mapping(db, _tenant(user), user.id, data.module, [f.model_dump() for f in data.fields], data.columns)
    return success_response(data=result, message="Suggested matches")
