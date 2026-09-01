"""Seed multiple tenants with isolated data to demonstrate multi-tenancy.

Usage:
    cd backend
    .venv/bin/python -m scripts.seed
"""

import asyncio
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.modules.inventory.models.brand import Brand
from app.modules.inventory.models.category import Category
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.models.unit import Unit
from app.modules.tenants.models import Permission, Role, Tenant, User
from app.modules.tenants.repository import TenantRepository

log = get_logger("seed")

# ── Shared permission matrix ──────────────────────────────────────────────────

RESOURCES = [
    "tenants", "users", "roles", "permissions", "departments", "branches",
    "items", "warehouses", "stock", "orders", "pricing", "returns",
    "invoices", "pos",
    "chart_of_accounts", "journal_entries", "accounts_payable",
    "accounts_receivable", "banking", "fixed_assets", "budgeting", "tax",
    "employees", "organization", "recruitment", "attendance", "leave",
    "payroll", "performance",
    "vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts",
    "leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets",
    "bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing",
]
ACTIONS = ["create", "read", "update", "delete", "approve"]

ROLE_RESOURCES: dict[str, list[str]] = {
    "Inventory Manager":   ["items", "warehouses", "stock", "orders", "pricing", "returns"],
    "Accounting Manager":     ["invoices", "chart_of_accounts", "journal_entries", "accounts_payable",
                            "accounts_receivable", "banking", "fixed_assets", "budgeting", "tax"],
    "HR Manager":          ["employees", "organization", "recruitment", "attendance", "leave",
                            "payroll", "performance"],
    "Sales Manager":       ["orders", "invoices", "pos", "leads", "accounts", "contacts",
                            "opportunities", "activities", "campaigns", "tickets"],
    "Procurement Manager": ["vendors", "requisitions", "rfq", "purchase_orders",
                            "goods_receipt", "contracts"],
}

# ── Tenant definitions ────────────────────────────────────────────────────────

@dataclass
class TenantDef:
    name: str
    slug: str
    plan: str
    admin_email: str
    admin_name: str
    business_users: list[tuple[str, str, str]]   # (email, full_name, role_name)
    categories: list[str]
    brands: list[str]
    units: list[tuple[str, str]]                  # (name, abbreviation)
    suppliers: list[tuple[str, str, str]]          # (name, email, phone)
    products: list[dict]


TENANTS: list[TenantDef] = [
    # ── Tenant 1: OneGemmy Electronics ───────────────────────────────────────
    TenantDef(
        name="OneGemmy Electronics",
        slug="onegemmy",
        plan="enterprise",
        admin_email="admin@onegemmy.com",
        admin_name="OneGemmy Admin",
        business_users=[
            ("inventory.manager@onegemmy.com",   "Inventory Manager",   "Inventory Manager"),
            ("inventory.staff@onegemmy.com",     "Inventory Staff",     "Inventory Manager"),
            ("accounting.manager@onegemmy.com",     "Accounting Manager",     "Accounting Manager"),
            ("accounting.staff@onegemmy.com",       "Accounting Staff",       "Accounting Manager"),
            ("hr.manager@onegemmy.com",          "HR Manager",          "HR Manager"),
            ("hr.staff@onegemmy.com",            "HR Staff",            "HR Manager"),
            ("sales.manager@onegemmy.com",       "Sales Manager",       "Sales Manager"),
            ("sales.staff@onegemmy.com",         "Sales Staff",         "Sales Manager"),
            ("procurement.manager@onegemmy.com", "Procurement Manager", "Procurement Manager"),
            ("procurement.staff@onegemmy.com",   "Procurement Staff",   "Procurement Manager"),
        ],
        categories=["Phones & Accessories", "Computers & Laptops", "Audio", "Cables & Chargers", "Smart Home"],
        brands=["Samsung", "Apple", "Anker", "JBL", "Logitech", "Xiaomi", "Sony"],
        units=[("Piece", "pcs"), ("Box", "box"), ("Pack", "pack")],
        suppliers=[
            ("TechHub Distributors", "orders@techhub.rw", "+250788100001"),
            ("Kigali Electronics Ltd", "supply@kigalielec.rw", "+250788100002"),
            ("AfriTech Imports", "info@afritech.rw", "+250788100003"),
        ],
        products=[
            {"name": "Samsung Galaxy A55",         "sku": "SAM-A55",    "category": "Phones & Accessories", "brand": "Samsung",  "unit": "Piece", "price": 450000, "cost": 320000, "stock": 25,  "min_stock": 5},
            {"name": "iPhone 15 Pro Case",         "sku": "APL-CASE15", "category": "Phones & Accessories", "brand": "Apple",    "unit": "Piece", "price": 8500,   "cost": 3000,   "stock": 120, "min_stock": 20},
            {"name": "Screen Protector 6.7\"",     "sku": "ACC-SP67",   "category": "Phones & Accessories", "brand": "Anker",    "unit": "Pack",  "price": 3500,   "cost": 1200,   "stock": 200, "min_stock": 30},
            {"name": "USB-C Cable 2m",             "sku": "CBL-USBC2",  "category": "Cables & Chargers",    "brand": "Anker",    "unit": "Piece", "price": 4500,   "cost": 1500,   "stock": 150, "min_stock": 25},
            {"name": "65W GaN Charger",            "sku": "CHG-GAN65",  "category": "Cables & Chargers",    "brand": "Anker",    "unit": "Piece", "price": 18000,  "cost": 9000,   "stock": 60,  "min_stock": 10},
            {"name": "Wireless Earbuds Pro",       "sku": "JBL-EARW",   "category": "Audio",                "brand": "JBL",      "unit": "Piece", "price": 35000,  "cost": 18000,  "stock": 40,  "min_stock": 8},
            {"name": "Bluetooth Speaker Mini",     "sku": "JBL-SPKM",   "category": "Audio",                "brand": "JBL",      "unit": "Piece", "price": 28000,  "cost": 14000,  "stock": 30,  "min_stock": 5},
            {"name": "Sony WH-1000XM5 Headphones", "sku": "SNY-WH5",    "category": "Audio",                "brand": "Sony",     "unit": "Piece", "price": 120000, "cost": 75000,  "stock": 12,  "min_stock": 3},
            {"name": "Logitech MX Master 3 Mouse", "sku": "LOG-MX3",    "category": "Computers & Laptops",  "brand": "Logitech", "unit": "Piece", "price": 55000,  "cost": 32000,  "stock": 20,  "min_stock": 4},
            {"name": "Mechanical Keyboard TKL",    "sku": "LOG-KBTK",   "category": "Computers & Laptops",  "brand": "Logitech", "unit": "Piece", "price": 48000,  "cost": 28000,  "stock": 15,  "min_stock": 3},
            {"name": "Laptop Stand Aluminium",     "sku": "ACC-LSTD",   "category": "Computers & Laptops",  "brand": "Xiaomi",   "unit": "Piece", "price": 22000,  "cost": 10000,  "stock": 35,  "min_stock": 5},
            {"name": "Portable Charger 20000mAh",  "sku": "ANK-PB20",   "category": "Cables & Chargers",    "brand": "Anker",    "unit": "Piece", "price": 32000,  "cost": 16000,  "stock": 45,  "min_stock": 8},
            {"name": "Smart LED Bulb E27",         "sku": "XMI-BULB",   "category": "Smart Home",           "brand": "Xiaomi",   "unit": "Piece", "price": 6500,   "cost": 2800,   "stock": 80,  "min_stock": 15},
            {"name": "Smart Plug WiFi",            "sku": "XMI-PLUG",   "category": "Smart Home",           "brand": "Xiaomi",   "unit": "Piece", "price": 9000,   "cost": 4000,   "stock": 50,  "min_stock": 10},
            {"name": "HDMI Cable 4K 2m",           "sku": "CBL-HDMI4",  "category": "Cables & Chargers",    "brand": "Anker",    "unit": "Piece", "price": 7500,   "cost": 2500,   "stock": 3,   "min_stock": 10},  # low stock
            {"name": "Samsung 128GB MicroSD",      "sku": "SAM-SD128",  "category": "Phones & Accessories", "brand": "Samsung",  "unit": "Piece", "price": 12000,  "cost": 6000,   "stock": 2,   "min_stock": 15},  # low stock
        ],
    ),

    # ── Tenant 2: FreshMart Grocery ───────────────────────────────────────────
    TenantDef(
        name="FreshMart Grocery",
        slug="freshmart",
        plan="professional",
        admin_email="admin@freshmart.rw",
        admin_name="FreshMart Admin",
        business_users=[
            ("inventory.manager@freshmart.rw",   "Inventory Manager",   "Inventory Manager"),
            ("accounting.manager@freshmart.rw",     "Accounting Manager",     "Accounting Manager"),
            ("sales.manager@freshmart.rw",       "Sales Manager",       "Sales Manager"),
            ("procurement.manager@freshmart.rw", "Procurement Manager", "Procurement Manager"),
            ("hr.manager@freshmart.rw",          "HR Manager",          "HR Manager"),
        ],
        categories=["Beverages", "Dairy & Eggs", "Grains & Cereals", "Snacks", "Cooking Essentials", "Fresh Produce"],
        brands=["Inyange", "Akabanga", "Urwibutso", "Bralirwa", "Minimex", "Azam"],
        units=[("Piece", "pcs"), ("Kilogram", "kg"), ("Litre", "L"), ("Carton", "ctn"), ("Pack", "pack")],
        suppliers=[
            ("Inyange Industries", "orders@inyange.rw", "+250788200001"),
            ("Bralirwa Ltd", "supply@bralirwa.rw", "+250788200002"),
            ("Minimex Rwanda", "info@minimex.rw", "+250788200003"),
        ],
        products=[
            {"name": "Inyange Milk 1L",           "sku": "INY-MLK1",   "category": "Dairy & Eggs",       "brand": "Inyange",   "unit": "Litre",   "price": 1200,  "cost": 900,   "stock": 200, "min_stock": 40},
            {"name": "Inyange Yogurt 500ml",      "sku": "INY-YGT5",   "category": "Dairy & Eggs",       "brand": "Inyange",   "unit": "Piece",   "price": 800,   "cost": 550,   "stock": 150, "min_stock": 30},
            {"name": "Akabanga Chilli Oil 100ml", "sku": "AKB-OIL1",   "category": "Cooking Essentials", "brand": "Akabanga",  "unit": "Piece",   "price": 2500,  "cost": 1400,  "stock": 80,  "min_stock": 15},
            {"name": "Minimex Maize Flour 2kg",   "sku": "MMX-MZ2",    "category": "Grains & Cereals",   "brand": "Minimex",   "unit": "Pack",    "price": 1800,  "cost": 1100,  "stock": 120, "min_stock": 25},
            {"name": "Minimex Wheat Flour 1kg",   "sku": "MMX-WH1",    "category": "Grains & Cereals",   "brand": "Minimex",   "unit": "Pack",    "price": 1200,  "cost": 750,   "stock": 100, "min_stock": 20},
            {"name": "Azam Rice 5kg",             "sku": "AZM-RC5",    "category": "Grains & Cereals",   "brand": "Azam",      "unit": "Pack",    "price": 6500,  "cost": 4200,  "stock": 60,  "min_stock": 12},
            {"name": "Bralirwa Primus Beer 500ml","sku": "BRL-PRM5",   "category": "Beverages",          "brand": "Bralirwa",  "unit": "Piece",   "price": 1000,  "cost": 650,   "stock": 300, "min_stock": 60},
            {"name": "Inyange Juice Orange 1L",   "sku": "INY-JCO1",   "category": "Beverages",          "brand": "Inyange",   "unit": "Litre",   "price": 1500,  "cost": 950,   "stock": 180, "min_stock": 35},
            {"name": "Urwibutso Passion Juice 1L","sku": "URW-JCP1",   "category": "Beverages",          "brand": "Urwibutso", "unit": "Litre",   "price": 1400,  "cost": 900,   "stock": 160, "min_stock": 30},
            {"name": "Cooking Oil 5L",            "sku": "OIL-CK5",    "category": "Cooking Essentials", "brand": "Inyange",   "unit": "Litre",   "price": 9500,  "cost": 6800,  "stock": 45,  "min_stock": 10},
            {"name": "Sugar 1kg",                 "sku": "SGR-1KG",    "category": "Cooking Essentials", "brand": "Azam",      "unit": "Kilogram","price": 1300,  "cost": 900,   "stock": 90,  "min_stock": 20},
            {"name": "Biscuits Assorted 400g",    "sku": "BSC-AST4",   "category": "Snacks",             "brand": "Azam",      "unit": "Pack",    "price": 1800,  "cost": 1100,  "stock": 70,  "min_stock": 15},
            {"name": "Tomatoes 1kg",              "sku": "VEG-TOM1",   "category": "Fresh Produce",      "brand": "Inyange",   "unit": "Kilogram","price": 800,   "cost": 400,   "stock": 4,   "min_stock": 20},  # low stock
            {"name": "Eggs Tray (30 pcs)",        "sku": "EGG-TRY30",  "category": "Dairy & Eggs",       "brand": "Inyange",   "unit": "Carton",  "price": 4500,  "cost": 3200,  "stock": 3,   "min_stock": 10},  # low stock
        ],
    ),
]


# ── Core seeder ───────────────────────────────────────────────────────────────

async def seed_permissions(session: AsyncSession) -> list[Permission]:
    """Ensure all permissions exist (shared across tenants) and return them."""
    existing = (await session.execute(select(Permission))).scalars().all()
    existing_names = {p.name for p in existing}
    new_perms = []
    for resource in RESOURCES:
        for action in ACTIONS:
            name = f"{resource}:{action}"
            if name not in existing_names:
                p = Permission(name=name, resource=resource, action=action, description=f"Can {action} {resource}")
                session.add(p)
                new_perms.append(p)
    await session.flush()
    await session.commit()
    all_perms = (await session.execute(select(Permission))).scalars().all()
    return list(all_perms)


async def seed_tenant(session: AsyncSession, td: TenantDef, all_permissions: list[Permission]) -> None:
    """Seed one tenant with all its data. Skips if tenant slug already exists."""
    existing = await TenantRepository(session).get_by_slug(td.slug)
    if existing:
        log.info(f"seed.skip_existing_tenant: {td.slug}")
        return

    log.info(f"seed.seeding_tenant: {td.slug}")

    tenant = Tenant(
        name=td.name, slug=td.slug, is_active=True,
        subscription_plan=td.plan, subscription_status="active",
    )
    session.add(tenant)
    await session.flush()

    # ── Roles ──
    admin_role = Role(name="Admin", tenant_id=tenant.id, description="Full system access", permissions=all_permissions)
    user_role  = Role(name="User",  tenant_id=tenant.id, description="Standard read-only access")
    session.add_all([admin_role, user_role])

    business_roles: dict[str, Role] = {}
    for role_name, resources in ROLE_RESOURCES.items():
        role_perms = [p for p in all_permissions if p.resource in resources]
        role = Role(name=role_name, tenant_id=tenant.id,
                    description=f"Manages {', '.join(resources[:2])} and related resources",
                    permissions=role_perms)
        session.add(role)
        business_roles[role_name] = role
    await session.flush()

    # ── Admin user ──
    session.add(User(
        tenant_id=tenant.id, email=td.admin_email,
        hashed_password=hash_password(settings.SEED_ADMIN_PASSWORD),
        full_name=td.admin_name, role="admin", role_id=admin_role.id,
        is_active=True, is_superuser=True,
    ))

    # ── Business users ──
    for email, full_name, role_name in td.business_users:
        session.add(User(
            tenant_id=tenant.id, email=email,
            hashed_password=hash_password(settings.SEED_USER_PASSWORD),
            full_name=full_name, role="member",
            role_id=business_roles[role_name].id,
            is_active=True, is_superuser=False,
        ))
    await session.flush()

    # ── Inventory: categories, brands, units, suppliers ──
    cats  = {name: Category(tenant_id=tenant.id, name=name) for name in td.categories}
    brands = {name: Brand(tenant_id=tenant.id, name=name) for name in td.brands}
    units  = {name: Unit(tenant_id=tenant.id, name=name, abbreviation=abbr) for name, abbr in td.units}
    supps  = {name: Supplier(tenant_id=tenant.id, name=name, email=email, phone=phone)
              for name, email, phone in td.suppliers}

    session.add_all(list(cats.values()) + list(brands.values()) + list(units.values()) + list(supps.values()))
    await session.flush()

    # ── Products ──
    for p in td.products:
        session.add(Product(
            tenant_id=tenant.id,
            name=p["name"], sku=p["sku"],
            category_id=cats[p["category"]].id,
            brand_id=brands[p["brand"]].id,
            unit_id=units[p["unit"]].id,
            price=p["price"], cost=p["cost"],
            stock=p["stock"], min_stock=p["min_stock"],
            is_active=True, has_variants=False,
        ))

    await session.commit()
    log.info(f"seed.tenant_complete: {td.slug}", extra={"_extra_fields": {
        "products": len(td.products),
        "users": len(td.business_users) + 1,
    }})


async def seed_superadmin(session: AsyncSession) -> None:
    """Seed the global superadmin (no tenant). Idempotent."""
    exists = (await session.execute(
        select(User).where(User.email == "superadmin@onegemmy.com")
    )).scalar_one_or_none()
    if exists:
        return
    session.add(User(
        tenant_id=None, email="superadmin@onegemmy.com",
        hashed_password=hash_password(settings.SEED_SUPER_ADMIN_PASSWORD),
        full_name="Global Super Admin", role="superadmin",
        is_active=True, is_superuser=True,
    ))
    await session.commit()
    log.info("seed.superadmin_complete")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        all_permissions = await seed_permissions(session)

    for td in TENANTS:
        async with AsyncSessionLocal() as session:
            # Re-fetch permissions in this session
            perms = (await session.execute(select(Permission))).scalars().all()
            await seed_tenant(session, td, list(perms))

    async with AsyncSessionLocal() as session:
        await seed_superadmin(session)

    log.info("seed.all_complete")


if __name__ == "__main__":
    asyncio.run(main())
