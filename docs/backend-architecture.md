# Backend Architecture: Folder Structure & Key Decisions

## Three Key Architectural Decisions

### 1. Entity-First Module Layout (Not Flat)
Each module groups files **per entity** instead of one flat `router.py` / `service.py` / etc. This prevents files from ballooning to thousands of lines as modules grow to 20–30+ entities.

```
app/modules/
  identity/                      # Consolidated IAM (auth + users + roles + permissions + tenants)
    __init__.py
    models.py
    schemas.py
    repository.py
    service.py
    router.py
    events.py                    # Domain events this module emits
  inventory/
    __init__.py
    items/
      routes.py, schemas.py, service.py, models.py, repository.py
    warehouses/
      routes.py, schemas.py, service.py, models.py, repository.py
    stock/
      routes.py, schemas.py, service.py, models.py, repository.py
    orders/                      # Sales orders + quotations
    pricing/                     # Price lists, discounts
    returns/                     # RMA
    events.py                    # StockLowEvent, StockAdjustedEvent, etc.
  sales/                         # Separated from inventory for clarity
    quotations/
    invoices/
    pos/
    events.py
  finance/
    chart_of_accounts/
    journal_entries/
    accounts_payable/
    accounts_receivable/
    banking/
    fixed_assets/
    budgeting/
    tax/
    events.py
  hr/
    employees/
    organization/
    recruitment/
    attendance/
    leave/
    payroll/
    performance/
    events.py
  procurement/
    vendors/
    requisitions/
    rfq/
    purchase_orders/
    goods_receipt/
    contracts/
    events.py
  crm/
    leads/
    accounts/
    contacts/
    opportunities/
    activities/
    campaigns/
    tickets/
    events.py
  manufacturing/
    bom/
    routing/
    mrp/
    work_orders/
    shop_floor/
    quality/
    costing/
    events.py
```

Each entity subdirectory follows the **`routes.py` → `schemas.py` → `service.py` → `models.py` → `repository.py`** pattern, keeping the codebase navigable and enforcing separation of concerns at a granular level.

### 2. Event Bus for Cross-Module Integration

Modules **never import each other's services directly**. Instead, they emit and subscribe to domain events through a lightweight in-process event bus.

```
app/core/
  event_bus.py          # Event dispatcher + subscriber registry
```

**Example flow** — low stock triggers purchase requisition:

```
inventory/stock/service.py          emits  StockLowEvent(sku, warehouse_id, qty)
                                       │
                                       ▼
procurement/requisitions/service.py  handles StockLowEvent → creates PurchaseRequisition
```

This keeps modules **independently testable**, prevents circular imports, and makes it straightforward to swap the in-process bus for a message queue (RabbitMQ, Redis Streams) later.

### 3. Layered Service + Repository Contracts

Separate **application services** (orchestration, workflows) from **domain services** (pure business rules). Repositories implement an abstract interface so they can be mocked.

```
# app/core/repository.py (existing BaseRepository — keep)
class BaseRepository(Generic[ModelT]):
    async def get(self, id: UUID) -> ModelT: ...
    async def save(self, obj: ModelT) -> ModelT: ...
    async def delete(self, obj: ModelT) -> None: ...

# Optional: per-module abstract repository for testability
class AbstractItemRepository(ABC):
    @abstractmethod
    async def get_by_sku(self, sku: str) -> Item | None: ...

class ItemRepository(BaseRepository[Item], AbstractItemRepository):
    async def get_by_sku(self, sku: str) -> Item | None: ...
```

Application services call the abstract repository and emit events. Domain services are stateless pure functions (easy to unit-test).

---

## Full Folder Structure

```
backend/
  app/
    __init__.py
    main.py                        # FastAPI app factory
    config.py                      # Pydantic Settings (env-based)
    database.py                    # Async engine, session factory, Base
    dependencies.py                # Shared DI (get_db, get_current_user, get_current_tenant)
    api_router.py                  # Prefix /api/v1, wires all module routers

    core/
      __init__.py
      security.py                  # JWT, password hashing, MFA
      permissions.py               # RBAC enforcement helpers
      exceptions.py                # Custom HTTP exceptions
      middleware.py                # Tenant resolution, request ID, CORS, request logging
      audit.py                     # Audit trail logger (before/after snapshots)
      event_bus.py                 # In-process event dispatcher + subscriber registry
      cache.py                     # Redis/cache abstraction (optional)

    shared/
      __init__.py
      enums.py                     # Global enums (EntityStatus, TransactionType, etc.)
      constants.py                 # Magic numbers, tier thresholds, system limits
      utils.py                     # Pure helper functions (date math, number formatting, etc.)
      pagination.py                # Reusable paginator
      validators.py                # Shared validation (tax_id, phone, email, currency)

    modules/
      identity/                    # Consolidated IAM (auth + users + roles + permissions + tenants)
        __init__.py
        models.py                  # User, Role, Permission, Tenant ORM models
        schemas.py                 # Pydantic request/response models
        repository.py
        service.py                 # Login, registration, role assignment, tenant provisioning
        router.py
        events.py                  # UserRegisteredEvent, TenantProvisionedEvent

      inventory/
        __init__.py
        items/                     # Product/item master, variants, barcodes
        warehouses/                # Warehouse + bin/location tracking
        stock/                     # Stock movements, adjustments, transfers, batch/serial tracking
        orders/                    # Sales orders, quotations, shipments
        pricing/                   # Price lists, discounts, promotions
        returns/                   # RMA, sales returns, restocking
        events.py                  # StockLowEvent, StockAdjustedEvent, OrderPlacedEvent

      sales/                       # Invoicing, POS (separated from inventory for clarity)
        __init__.py
        invoices/
        pos/
        events.py

      finance/
        __init__.py
        chart_of_accounts/
        journal_entries/
        accounts_payable/
        accounts_receivable/
        banking/
        fixed_assets/
        budgeting/
        tax/
        events.py                  # JournalPostedEvent, PaymentReceivedEvent

      hr/
        __init__.py
        employees/
        organization/
        recruitment/
        attendance/
        leave/
        payroll/
        performance/
        events.py                  # PayrollPostedEvent, EmployeeOnboardedEvent

      procurement/
        __init__.py
        vendors/
        requisitions/
        rfq/
        purchase_orders/
        goods_receipt/
        contracts/
        events.py                  # POIssuedEvent, GoodsReceivedEvent

      crm/
        __init__.py
        leads/
        accounts/
        contacts/
        opportunities/
        activities/
        campaigns/
        tickets/
        events.py                  # LeadConvertedEvent, OpportunityWonEvent

      manufacturing/
        __init__.py
        bom/
        routing/
        mrp/
        work_orders/
        shop_floor/
        quality/
        costing/
        events.py                  # WorkOrderCompletedEvent, MRPGeneratedEvent

    integrations/                   # Third-party adapters (wrapped behind abstractions)
      __init__.py
      email/
        sender.py
        templates/
      payments/                    # Stripe, PayPal adapter
      storage/                     # S3 / local / MinIO adapter
      notifications/               # Push, SMS gateway

    reports/                        # Cross-module reporting (separate from entity CRUD)
      __init__.py
      financial_reports.py         # Trial balance, P&L, balance sheet, cash flow
      inventory_reports.py         # Stock aging, valuation, slow-movers
      dashboard.py                 # Executive dashboard aggregators

    tests/
      __init__.py
      conftest.py                  # Test DB, test client, tenant seeding fixtures
      unit/                        # Domain service tests (no DB)
      integration/                 # Repository + DB tests
      e2e/                         # Full API endpoint tests
      modules/
        identity/
        inventory/
        sales/
        finance/
        hr/
        procurement/
        crm/
        manufacturing/

  alembic/                         # DB migrations
    env.py
    versions/

  scripts/                         # Management / ops scripts
    seed.py                        # Seed demo data
    migrate.py                     # Run migrations
    create_tenant.py

  docker/
    Dockerfile
    docker-compose.yml

  pyproject.toml
  README.md
```

## Improvements Over the Reference Structure

| Aspect | Reference (`erp_backend/`) | Improved |
|--------|--------------------------|----------|
| **Module granularity** | Flat per module (`models.py`, `service.py`) | Entity subdirectories inside each module (`items/`, `warehouses/`, `stock/`) — scales to 30+ entities without monolith files |
| **Identity** | Separate `auth/`, `users/`, `roles/`, `permissions/`, `tenants/` folders | Consolidated `identity/` module — cohesive domain boundary, fewer cross-imports |
| **Sales** | Buried inside `inventory/` | Separate `sales/` module — distinct lifecycle, separate team ownership |
| **Domain events** | Global or absent | `events.py` per module — self-documenting, co-located with the emitting code |
| **Cross-module coupling** | Direct service calls | Event bus — decoupled, testable, queue-ready |
| **Tests** | Separate `tests/` tree | Tests mirror module structure inside `app/tests/` — co-located, easier to navigate |
| **Reports** | Flat files | `reports/` app-level module — aggregates across multiple modules |
| **Shared utilities** | Implicit | Explicit `shared/` layer — `enums.py`, `validators.py`, `constants.py` |
| **Audit** | Missing | `core/audit.py` — mandatory before/after logging for all business entities |

---

## Architecture Name

**Domain-Driven Design (DDD) based Modular Monolith with Clean Architecture principles.**

Breaking it down:

| Term | Meaning |
|------|---------|
| **Modular Monolith** | Single backend deployment, independent business modules — each acts like its own mini-system |
| **Domain-Driven Design** | Organized around business domains (`inventory/`, `finance/`, `hr/`), not technical layers (`controllers/`, `models/`) |
| **Clean Architecture** | Dependency arrows point inward: `router → service → repository → database`. Business logic knows nothing about FastAPI or PostgreSQL |

For an enterprise ERP, the professional description:

> *A Domain-Driven Modular Monolith built using Clean Architecture principles, designed for scalability, maintainability, and future migration to microservices.*

---

## How This Fits Your ERP Requirements (Module by Module)

### 1. Identity & Access Management (Shared Platform)

**Maps to:** NFR-4 (Authentication), NFR-5 (RBAC), NFR-6 (Auditability)

```
modules/identity/
    user/           # User accounts, credentials, MFA
    role/           # Role definitions (Admin, Finance Manager, HR Manager, Sales User)
    permission/     # Granular permissions (can_create_po, can_approve_journal)
    company/        # Company/legal entity
    tenant/         # Multi-tenant isolation
    session/        # Active sessions, JWT refresh
```

Every module checks permissions from here via `get_current_user()` and `require_permission()`.

### 2. Inventory Module

**Maps to:** FR-1.1 through FR-5.4 (Item master, warehouse, stock, batch, barcode, valuation)

```
inventory/
    models.py       →  Product, Category, Warehouse, Stock, StockMovement, Batch, SerialNumber
    service.py      →  create_product(), transfer_stock(), calculate_inventory_value()
    events.py       →  stock_updated, low_stock_detected
```

**Flow:**
```
Sales Order → Inventory Service → Stock Movement → Accounting Event
```

### 3. Finance Module

**Maps to:** FR-1.1 through FR-5.5 (COA, journals, AP, AR, bank, assets, budgets, tax)

```
finance/
    models.py       →  Account, JournalEntry, JournalLine, Invoice, Payment, Tax
    service.py      →  post_invoice(), create_journal(), reconcile_payment()
```

**Flow — customer buys product:**
```
Sales Module (Invoice Created)
    → Finance Module
        Debit:  Accounts Receivable
        Credit: Sales Revenue
```

### 4. HR & Payroll

**Maps to:** FR-1.1 through FR-5.3 (Employee master, attendance, payroll, payslips)

```
hr/
    employee.py     →  Employee, Department, Position
    attendance.py   →  CheckIn, CheckOut, Leave
    payroll.py      →  SalaryStructure, PayrollRun, Payslip, Deduction
```

**Flow:**
```
Employee Attendance → Payroll Calculation → Finance Journal Entry
```

### 5. Procurement

**Maps to:** FR-1.1 through FR-5.3 (Vendors, POs, GRN, 3-way matching)

```
procurement/
    supplier.py         →  Vendor
    purchase_order.py   →  PurchaseOrder, PurchaseLine
    receiving.py        →  GRN, QualityCheck
```

**Flow:**
```
Purchase Order → Goods Receipt → Inventory Update → Accounting Payable
```

### 6. CRM

**Maps to:** FR-1.1 through FR-5.4 (Leads, contacts, opportunities, campaigns, tickets)

```
crm/
    lead.py         →  Lead, Contact, Account
    opportunity.py  →  Opportunity, PipelineStage
    ticket.py       →  SupportTicket
```

**Flow:**
```
Lead → Opportunity → Quotation → Sales Order
```

### 7. Manufacturing

**Maps to:** FR-1.1 through FR-5.4 (BOM, MRP, work orders, shop floor, quality, costing)

```
manufacturing/
    bom.py          →  BillOfMaterial, Component
    mrp.py          →  MaterialRequirementPlan
    work_orders.py  →  ProductionOrder, Operation, WorkCenter
```

**Flow:**
```
Sales Forecast → MRP Engine → Purchase Request → Production Order → Finished Goods Inventory
```

---

## Important Enterprise Patterns

### Repository Pattern

Do not put SQL directly in routers.

```
Bad:    router → db.query(Product)
Good:   router → service → repository → database
```

**Example:**
```
product_router.py → product_service.py → product_repository.py
```

### Service Layer

All business logic lives in services, never in routes or models.

```
inventory/service.py contains:
    receive_goods()
    reserve_stock()
    transfer_stock()
```

### Event-Driven Communication

ERP modules depend on each other. Events decouple them:

```
Sales Order Created
    → Inventory Event (Reduce Stock)
    → Finance Event (Create Revenue Journal)
```

Later can be swapped for RabbitMQ, Kafka, or Redis Streams.

---

## Database Recommendation

| Component | Choice |
|-----------|--------|
| **Database** | PostgreSQL |
| **ORM** | SQLAlchemy 2.0 (async) |
| **Migrations** | Alembic |
| **Validation** | Pydantic v2 |
| **Framework** | FastAPI |
| **Cache** | Redis |
| **Async tasks** | Celery |
| **Infrastructure** | Docker |

---

## Build Order: First 3 Things Before Modules

### Phase 1 — Platform Foundation
```
core/
    authentication      # JWT, MFA, password hashing
    RBAC                # Role/permission enforcement
    audit logging       # Before/after snapshots on all business entities
    tenant management   # Multi-tenant isolation (shared-table or schema-per-tenant)
```

### Phase 2 — Master Data
```
shared/
    Company
    Currency
    Tax
    Users
    Documents/Attachments
```

### Phase 3 — Core ERP Flow (Revenue Cycle)

Start here because money flows through this chain:

```
CRM → Sales → Inventory → Accounting
  │       │        │          │
  │       │        │          └── Invoice → Payment → GL
  │       │        └── Stock reduction → COGS
  │       └── Order → Quotation
  └── Lead → Opportunity
```

This architecture can grow from 100 to thousands of ERP users without a rewrite.

---

## Quick Start Guide (Adding a New Entity)

```
Add entity "batches" to inventory:

1. Create app/modules/inventory/batches/
2. Create files:
   - models.py        → Batch ORM model (extends UUIDPKMixin + TenantScopedMixin)
   - schemas.py       → BatchCreate, BatchUpdate, BatchRead
   - repository.py    → BatchRepository(BaseRepository[Batch])
   - service.py       → async def create_batch(db, data) → Batch
   - routes.py        → CRUD endpoints, wire into router
3. Add router to inventory/__init__.py
4. Add model import to alembic/env.py
5. Write tests in app/tests/modules/inventory/batches/
```
