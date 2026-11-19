# 12 — Code patterns

Real code copied from the repository (unchanged), so a new contributor or AI can match conventions exactly.

## Backend: model → schema → repository → service → route (Sales Targets)

A complete, small feature using every layer. Router is mounted under `/api/v1/tenants` by `app/api_router.py` (sales router, gated by `require_feature("sales")` + `require_module_write("sales")`).

### Model — `backend/app/modules/sales/models/target.py`

```python
import uuid

from sqlalchemy import ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Target(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "sales_targets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_value: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    achieved_value: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="number")
    period: Mapped[str] = mapped_column(String(50), nullable=False)

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    assignee = relationship("User", foreign_keys=[assigned_to], lazy="joined")

    __table_args__ = (
        Index("ix_sales_targets_tenant_id", "tenant_id"),
        Index("uq_sales_targets_tenant_name_period", "tenant_id", "name", "period", unique=True),
    )

```

### Schemas — `backend/app/modules/sales/schemas/target.py`

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TargetCreate(BaseModel):
    name: str
    target_value: float
    achieved_value: float = 0
    unit: str = "number"
    period: str
    assigned_to: uuid.UUID | None = None


class TargetUpdate(BaseModel):
    name: str | None = None
    target_value: float | None = None
    achieved_value: float | None = None
    unit: str | None = None
    period: str | None = None
    assigned_to: uuid.UUID | None = None


class TargetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    target_value: float
    achieved_value: float
    unit: str
    period: str
    assigned_to: uuid.UUID | None
    created_at: datetime | None = None
    updated_at: datetime | None = None

```

### Repository — `backend/app/modules/sales/repository/target.py` (base class: `backend/app/core/repository.py`)

```python
import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.sales.models.target import Target


class TargetRepository(BaseRepository[Target]):
    model = Target

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Target | None:
        result = await self.db.execute(
            select(Target).where(Target.id == id, Target.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, period: str | None = None, offset: int = 0, limit: int = 50) -> list[Target]:
        stmt = select(Target).where(Target.tenant_id == tenant_id)
        if period:
            stmt = stmt.where(Target.period == period)
        stmt = stmt.order_by(Target.period.desc(), Target.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Target).where(Target.tenant_id == tenant_id)
        )
        return result.scalar_one()

```

```python
# backend/app/core/repository.py
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
            err_str = str(e.orig).lower()
            if "sku" in err_str:
                raise ConflictError("A product with this SKU already exists") from e
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

```

### Service — `backend/app/modules/sales/service/target.py`

```python
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.sales.models.target import Target
from app.modules.sales.repository import TargetRepository
from app.modules.sales.schemas import TargetCreate, TargetRead, TargetUpdate


async def list_targets(db: AsyncSession, tenant_id: uuid.UUID, period: str | None = None, offset: int = 0, limit: int = 50) -> list[TargetRead]:
    items = await TargetRepository(db).list_for_tenant(tenant_id, period, offset, limit)
    return [TargetRead.model_validate(i) for i in items]


async def count_targets(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await TargetRepository(db).count_for_tenant(tenant_id)


async def get_target(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> TargetRead:
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Target not found")
    return TargetRead.model_validate(obj)


async def create_target(db: AsyncSession, tenant_id: uuid.UUID, data: TargetCreate) -> TargetRead:
    obj = Target(tenant_id=tenant_id, **data.model_dump())
    obj = await TargetRepository(db).save(obj)
    await db.commit()
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return TargetRead.model_validate(obj)


async def update_target(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: TargetUpdate) -> TargetRead:
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Target not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await TargetRepository(db).save(obj)
    await db.commit()
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    return TargetRead.model_validate(obj)


async def delete_target(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await TargetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Target not found")
    await TargetRepository(db).delete(obj)
    await db.commit()

```

### Routes — `backend/app/modules/sales/routes/target.py`

```python
import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import TargetCreate, TargetUpdate

router = APIRouter(tags=["Sales - Targets"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/targets")
async def list_targets(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_targets(db, current_user.tenant_id, period, page_params.offset, page_params.limit)
    total = await service.count_targets(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Targets retrieved successfully")


@router.post("/sales/targets")
async def create_target(data: TargetCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_target(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Target created successfully", status_code=201)


@router.get("/sales/targets/{id}")
async def get_target(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_target(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Target retrieved successfully")


@router.patch("/sales/targets/{id}")
async def update_target(id: uuid.UUID, data: TargetUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_target(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Target updated successfully")


@router.delete("/sales/targets/{id}")
async def delete_target(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_target(db, current_user.tenant_id, id)
    return success_response(message="Target deleted successfully")

```

Note: `count_targets` ignores the `period` filter, so `total` can disagree with a filtered list — a known pattern bug (see 11).

### Response helpers — `backend/app/core/response.py`

```python
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200
):
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({
            "success": True,
            "message": message,
            "data": data
        })
    )


def paginated_response(
    items: list,
    total: int,
    page: int,
    page_size: int,
    message: str = "Success",
    summary: dict | None = None,
):
    return JSONResponse(
        status_code=200,
        content=jsonable_encoder({
            "success": True,
            "message": message,
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": -(-total // page_size) if page_size else 0,
                **({"summary": summary} if summary is not None else {}),
            }
        })
    )


def error_response(
    message: str,
    status_code: int = 400,
    errors: Any = None
):
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({
            "success": False,
            "message": message,
            "errors": errors
        })
    )
```

### Errors — `backend/app/core/exceptions.py` (excerpt)

```python
from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.core.logging import get_logger
from app.core.response import error_response

log = get_logger("exceptions")


class AppError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    detail: str = "Something went wrong"

    def __init__(self, detail: str | None = None, status_code: int | None = None):
        self.detail = detail or self.detail
        self.status_code = status_code or self.status_code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    detail = "Resource not found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    detail = "Resource already exists"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Not authenticated"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    detail = "Not permitted to perform this action"


class ValidationError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    detail = "Validation error"


class ApprovalRequiredError(AppError):
    """The change is real but this person may not make it themselves: it has to be requested and approved."""

    status_code = status.HTTP_409_CONFLICT
    detail = "This change needs approval"


class QuotaExceededError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    detail = "Usage limit exceeded"


```

### Pagination dependency — `backend/app/core/pagination.py`

```python
from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel


class PageParams(BaseModel):
    page: int = 1
    page_size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


def _page_params(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500)) -> PageParams:
    return PageParams(page=page, page_size=page_size)


PageQuery = Annotated[PageParams, Depends(_page_params)]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int

```

## Frontend: list page that fetches and displays data — `frontend/src/app/(erp)/sales/quotations/page.tsx`

Pattern: hook from `lib/api/hooks.ts` → `TableState` for loading/error/empty → `TableScroll` table (phone cards) → `Pagination`; create/edit in a `Drawer`-based editor; detail in a drawer.

```tsx
"use client";
import { useDeferredValue, useState } from "react";
import { FilePlus2, Search } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/config";
import type { ApiQuotation, QuotationStatus } from "@/lib/api";
import { useQuotations, useSalesTeam } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { QuotationEditor } from "@/components/sales/QuotationEditor";
import { QuotationBadge, QuotationDetails } from "@/components/sales/QuotationDetails";

const STATUSES: ("All" | QuotationStatus)[] = ["All", "Draft", "Sent", "Accepted", "Rejected", "Expired"];

export default function QuotationsPage() {
  const { currencySymbol } = useAppConfig();
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState<"All" | QuotationStatus>("All");
  const [search, setSearch] = useState("");
  const [seller, setSeller] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ApiQuotation | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const team = useSalesTeam();
  const q = useQuotations(page, { status: status === "All" ? undefined : status, search: useDeferredValue(search) || undefined, salesperson_id: seller || undefined });
  const items = q.data?.items ?? [];
  const filtered = status !== "All" || !!search || !!seller;
  const clear = () => { setStatus("All"); setSearch(""); setSeller(""); setPage(1); };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="pesaa-page-title">Quotations</h1><p className="text-sm text-muted">Offers to customers. They become a sale only when accepted and converted.</p></div>
        {hasPermission("orders:create") && <Button onClick={() => setEditing("new")}><FilePlus2 size={15} aria-hidden /> New quotation</Button>}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1">{STATUSES.map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }} className={`h-8 rounded-md px-3 text-xs font-medium ${status === s ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>{s}</button>)}</div>
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Search quotations" className="pl-8" placeholder="Search by number" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        {(team.data?.length ?? 0) > 1 && <Select aria-label="Salesperson" className="w-auto" value={seller} onChange={(e) => { setSeller(e.target.value); setPage(1); }}><option value="">All salespeople</option>{team.data!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
      </div>

      {q.isLoading || q.error || items.length === 0 ? (
        <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={items.length === 0} filtered={filtered} onClearFilters={clear} title="No quotations yet" hint="Create one for a customer, then mark it as sent." />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <TableScroll mobileLayout="cards" label="Quotations">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Number</th><th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Salesperson</th><th className="px-4 py-2.5 font-medium">Issued</th><th className="px-4 py-2.5 font-medium">Valid until</th><th className="px-4 py-2.5 text-right font-medium">Total</th><th className="px-4 py-2.5 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-border">{items.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-surface/60" onClick={() => setViewing(x.id)}>
                  <td className="px-4 py-3 font-medium"><button className="text-accent hover:underline" onClick={(e) => { e.stopPropagation(); setViewing(x.id); }}>{x.quote_number}</button></td>
                  <td className="px-4 py-3">{x.customer?.name ?? <span className="text-muted">Walk-in</span>}</td>
                  <td className="px-4 py-3">{x.salesperson_name ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{x.issue_date}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{x.expiry_date ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney(x.total, currencySymbol)}</td>
                  <td className="px-4 py-3"><QuotationBadge status={x.status} /></td>
                </tr>))}</tbody>
            </table>
          </TableScroll>
          <Pagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} />
        </div>
      )}

      {editing && <QuotationEditor initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={(saved) => { setEditing(null); setViewing(saved.id); }} />}
      {viewing && !editing && <QuotationDetails id={viewing} onClose={() => setViewing(null)} onEdit={(x) => setEditing(x)} />}
    </div>
  );
}

```

The API function and hook it uses:

```ts
// frontend/src/lib/api/sales.ts
  listQuotations: (page = 1, pageSize = 25, f: { status?: string; search?: string; salesperson_id?: string } = {}) =>
    request<PaginatedResponse<ApiQuotation>>(`${BASE}/quotations${qs({ page, page_size: pageSize, ...f })}`),
  getQuotation: (id: string) => request<SingleResponse<ApiQuotation>>(`${BASE}/quotations/${id}`),

// frontend/src/lib/api/hooks.ts
export const useQuotations = (page = 1, f: { status?: string; search?: string; salesperson_id?: string } = {}, opts?: QueryOpts) =>
  useQ([...QUOTATIONS, page, f.status ?? "all", f.search ?? "", f.salesperson_id ?? ""], () => salesApi.listQuotations(page, 25, f), (r) => r.data, { placeholderData: undefined, ...opts });
export const useQuotation = (id: string | undefined, opts?: QueryOpts) =>
  useQ([...QUOTATIONS, id], () => salesApi.getQuotation(id!), (r) => r.data, { ...opts, enabled: !!id && (opts?.enabled ?? true) });
```

Shared loading/error/empty renderer — `frontend/src/components/ui/TableState.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** The one loading / error / empty look for a table's body. A failed request never reads as "no records", and an empty
 *  result under filters offers to clear them. Render it in place of the table; render the table when it returns null. */
export function TableState({ loading, error, onRetry, empty, filtered, onClearFilters, title = "Nothing here yet", hint, action, rows = 5 }: {
  loading?: boolean; error?: unknown; onRetry?: () => void; empty?: boolean; filtered?: boolean; onClearFilters?: () => void;
  title?: string; hint?: string; action?: ReactNode; rows?: number;
}) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading" className="divide-y divide-border rounded-xl border border-border bg-card">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-4 px-4 py-4"><span className="h-3 w-24 animate-pulse rounded bg-surface" /><span className="h-3 flex-1 animate-pulse rounded bg-surface" /><span className="h-3 w-16 animate-pulse rounded bg-surface" /></div>)}
      </div>
    );
  }
  if (error) {
    const detail = (error as { detail?: string })?.detail ?? (error as Error)?.message ?? "The records could not be loaded.";
    return (
      <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-8 text-center">
        <AlertCircle size={20} className="text-red-600" aria-hidden />
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">Could not load this list</p>
        <p className="max-w-md text-xs text-muted">{detail}</p>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
      </div>
    );
  }
  if (!empty) return null;
  const Icon = filtered ? SearchX : Inbox;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
      <Icon size={22} className="text-muted" aria-hidden />
      <p className="text-sm font-semibold">{filtered ? "No records match your filters" : title}</p>
      {(filtered || hint) && <p className="max-w-md text-xs text-muted">{filtered ? "Try a different search or date range, or clear the filters." : hint}</p>}
      {filtered && onClearFilters ? <Button variant="outline" size="sm" onClick={onClearFilters}>Clear filters</Button> : action}
    </div>
  );
}

```

## Frontend: a form with validation — `frontend/src/components/sales/ChangeSalespersonDialog.tsx`

Pattern: controlled `useState` fields inside a `Drawer`; `Field` labels with `required`/`hint`; submit disabled until valid (`!person`, reason ≥ 3 chars, unchanged value); `mutateAsync` with server error shown from `cause.detail` in a `role="alert"` paragraph; pending state on the button. No form library.

```tsx
"use client";
import { useState } from "react";
import type { ApiOrder } from "@/lib/api";
import { useChangeSalesperson, useSalesTeam } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select, Textarea } from "@/components/ui/Form";

/** Re-credit a sale to another salesperson. Money and stock are untouched; the change and the reason go in the audit trail. */
export function ChangeSalespersonDialog({ order, onClose }: { order: ApiOrder; onClose: () => void }) {
  const team = useSalesTeam();
  const change = useChangeSalesperson();
  const [person, setPerson] = useState(order.salesperson_id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const same = person === (order.salesperson_id ?? "");
  const save = async () => {
    setError("");
    try { await change.mutateAsync({ id: order.id, salespersonId: person, reason: reason.trim() }); onClose(); }
    catch (cause) { setError((cause as { detail?: string })?.detail ?? "That didn't work. Please try again."); }
  };
  return (
    <Drawer open onClose={() => !change.isPending && onClose()} side="center" size="sm" title={`Change salesperson · ${order.order_number}`}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Currently credited to <span className="font-medium text-foreground">{order.salesperson_name ?? "nobody"}</span>. Only who gets the credit changes: money and stock stay as they are.</p>
        <Field label="Salesperson" required><Select value={person} onChange={(e) => setPerson(e.target.value)}>{!person && <option value="">Choose…</option>}{(team.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <Field label="Reason" required hint="Kept in the audit trail."><Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={change.isPending} onClick={onClose}>Cancel</Button><Button disabled={change.isPending || same || !person || reason.trim().length < 3} onClick={() => void save()}>{change.isPending ? "Saving…" : "Change salesperson"}</Button></div>
      </div>
    </Drawer>
  );
}

```

Larger forms use `FormKit` helpers (`FormSection`, `FormErrorSummary`, `focusFirstInvalid`, `MoneyField`) from `frontend/src/components/ui/FormKit.tsx`.

## Frontend: API client and auth handling — `frontend/src/lib/api/client.ts`

```ts
import { clearApiQueryCache } from "./queryClient";

// The backend now runs on a VPS, not Render — there's no fixed production
// URL to fall back to here. NEXT_PUBLIC_API_URL must be set explicitly for
// any real deployment; this default only covers local dev.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const REQUEST_TIMEOUT_MS = 60_000;

let _refreshPromise: Promise<string | null> | null = null;
let _onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void) {
  _onSessionExpired = fn;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export function clearApiCache() {
  clearApiQueryCache();
}

// "Remember me" decides where tokens live: localStorage survives browser
// restarts, sessionStorage clears when the tab/browser closes. Reads check
// sessionStorage first so an unremembered session takes priority if both
// happen to be set. Writes with no explicit `remember` (e.g. token refresh)
// reuse whichever storage already holds the token, preserving the choice
// made at login.
function activeStorage(key: string): Storage {
  if (typeof window === "undefined") return localStorage;
  return sessionStorage.getItem(key) !== null ? sessionStorage : localStorage;
}

function setStored(key: string, value: string, remember?: boolean) {
  if (typeof window === "undefined") return;
  const storage = remember === undefined ? activeStorage(key) : remember ? localStorage : sessionStorage;
  const other = storage === localStorage ? sessionStorage : localStorage;
  other.removeItem(key);
  storage.setItem(key, value);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("onegemmy_token") ?? localStorage.getItem("onegemmy_token");
}

export function setStoredToken(token: string, remember?: boolean) {
  setStored("onegemmy_token", token, remember);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("onegemmy_refresh_token") ?? localStorage.getItem("onegemmy_refresh_token");
}

export function setStoredRefreshToken(token: string, remember?: boolean) {
  setStored("onegemmy_refresh_token", token, remember);
}

export function clearStoredTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("onegemmy_token");
    localStorage.removeItem("onegemmy_refresh_token");
    sessionStorage.removeItem("onegemmy_token");
    sessionStorage.removeItem("onegemmy_refresh_token");
  }
}

// Only meaningful for a user with no fixed branch of their own (an
// Admin/Owner — see User.branchId) — it's how they pick which branch a
// POS sale or other branch-scoped write applies to. For a user who does
// have a fixed branch, the backend ignores this header entirely and
// always uses their own branch, so it's harmless to leave unset for them.
export function getActiveBranchId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("onegemmy_active_branch_id");
}

export function setActiveBranchId(branchId: string | null) {
  if (typeof window === "undefined") return;
  if (branchId) localStorage.setItem("onegemmy_active_branch_id", branchId);
  else localStorage.removeItem("onegemmy_active_branch_id");
}

async function tryRefreshToken(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, REQUEST_TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      const newToken = data?.data?.access_token;
      const newRefresh = data?.data?.refresh_token;
      if (newToken) setStoredToken(newToken);
      if (newRefresh) setStoredRefreshToken(newRefresh);
      return newToken ?? null;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

// A 401 from these means "wrong credentials" / "expired reset link", not
// "your session died" — they're the entry points to a session, not calls
// made during one, so they must never trigger the refresh-then-session-
// expired flow below (that flow assumes an existing session went stale).
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/token", "/auth/register", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/change-password"];

export async function request<T>(path: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const token = getStoredToken();
  const activeBranchId = getActiveBranchId();
  const headers: Record<string, string> = {
    ...(typeof FormData !== "undefined" && options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (activeBranchId) headers["X-Branch-Id"] = activeBranchId;

  const res = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers }, timeoutMs);

  // Auto-refresh on 401
  if (res.status === 401 && !PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p))) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      // Retry original request with new token
      const retryHeaders = { ...headers, "Authorization": `Bearer ${newToken}` };
      const retryRes = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers: retryHeaders }, timeoutMs);
      if (retryRes.ok) return retryRes.json();
    }
    // Refresh failed — session expired
    clearStoredTokens();
    _onSessionExpired?.();
    throw { status: 401, detail: "Session expired" };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((e: { msg: string }) => e.msg).join(", ")
      : body.detail || body.message || res.statusText;
    throw { status: res.status, detail };
  }
```

TanStack Query wrappers — `frontend/src/lib/api/hooks.ts`:

```ts
  dataManagementRequestsApi,
} from "@/lib/api";

// ── helpers ──────────────────────────────────────────────────────────────────

type QueryOpts = { placeholderData?: undefined; enabled?: boolean; refetchInterval?: number; refetchOnWindowFocus?: boolean; staleTime?: number; retry?: boolean | number };

function useQ<TResponse, TSelected, TKey extends unknown[]>(
  key: TKey,
  queryFn: () => Promise<TResponse>,
  select: (res: TResponse) => TSelected,
  opts?: QueryOpts,
) {
  return useQuery({
    queryKey: key,
    queryFn,
    select,
    // Keeps the previous page's data on screen (instead of flashing to a
    // loading state) while a new query key — e.g. the next page, a search
    // term, a filter — is in flight. `isFetching` still flips true/false so
    // callers can show a subtle "updating" affordance if they want one.
    placeholderData: keepPreviousData,
    ...opts,
  });
}

function mutation<TVariables, TResponse>(
  fn: (variables: TVariables) => Promise<TResponse>,
  invalidateKeys: (unknown[])[],
) {
  return function useApiMutation(options?: UseMutationOptions<TResponse, Error, TVariables>) {
    const qc = useQueryClient();
    return useMutation<TResponse, Error, TVariables>({
      ...options,
      mutationFn: fn,
      onSuccess: async (data, variables, context, mutationContext) => {
        const keys = invalidateKeys.some(key => key[0] === "accounting") ? [...invalidateKeys, ["accounting", "workspace"]] : invalidateKeys;
        await Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: key })));
        options?.onSuccess?.(data, variables, context, mutationContext);
      },
    });
  };
}
```

Backend token creation — `backend/app/core/security.py` (excerpt):

```python
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def validate_password_strength(password: str) -> None:
    """Server-side mirror of the register form's password checklist — the
    frontend check alone doesn't stop a direct API call with a weak password.
    """
    from app.core.exceptions import ValidationError

    if len(password) < 8:
        raise ValidationError("Password must be at least 8 characters long")
    if not any(c.isdigit() for c in password):
        raise ValidationError("Password must contain at least one number")
    if not any(c.isupper() for c in password):
        raise ValidationError("Password must contain at least one uppercase letter")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "type": "access",
        "iat": datetime.now(UTC),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "type": "refresh",
        "iat": datetime.now(UTC),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


```

## Conventions

**Naming**
- Python: modules/files `snake_case`; trailing underscore for keywords (`return_.py`); classes `PascalCase` (`Order`, `OrderCreate`, `OrderRead`, `OrderUpdate`, `OrderRepository`); service functions verbs (`list_targets`, `create_target`); route handlers same as service names.
- Tables `<module>_<entity>` plural (e.g. `sales_targets`), with exceptions (see 06). Indexes `ix_<table>_<cols>`, uniques `uq_<table>_<cols>`.
- Endpoints: plural nouns, kebab-case paths (`/sales/orders/{id}/void-request`), actions as POST sub-resources (`/approve`, `/void`, `/archive`, `/restore`, `/convert`).
- TypeScript: components `PascalCase.tsx`; hooks `useX`/`useCreateX`/`useUpdateX`; API objects `xApi` with verb methods; API types `ApiOrder`, `ApiQuotation`; query keys as const arrays (`["sales","quotations"]`).
- User-facing copy: plain sentences ("That didn't work. Please try again."), explained errors; CSS utility classes `pesaa-*` for shared contracts.

**Error handling**
- Backend: raise `NotFoundError` (404), `ValidationError` (422), `ConflictError` (409), `ForbiddenError` (403), `UnauthorizedError` (401), `ApprovalRequiredError`, `QuotaExceededError` → handler returns `{"success": false, "message", "errors"}`. Unhandled exceptions are logged and return a generic 500 envelope (no traceback).
- Frontend: `request()` throws a plain object `{status, detail}` (not an `Error`); components read `(cause as {detail?: string})?.detail` with a friendly fallback. 401 triggers one refresh attempt, then `onSessionExpired`.

**Response format**
- Single: `{"success": true, "message": "...", "data": {...}}`
- List: `{"success": true, "message": "...", "data": {"items": [...], "total": n, "page": p, "page_size": s, "total_pages": t, "summary"?: {...}}}`
- Files: PDFs/CSVs streamed with `Content-Disposition` (exposed via CORS) and named `<Business> - <Document> - <ref>.pdf`.
