from sqlalchemy.orm import Session
from app.models import User, Company, Shop, Role, Permission
from app.security import get_password_hash

ALL_PERMISSIONS = [
    ("dashboard.view", "View Dashboard", "Can view the main dashboard", "Dashboard"),
    ("sales.view", "View Sales", "Can view sales pipeline and deals", "Sales"),
    ("sales.create", "Create Deals", "Can create new deals", "Sales"),
    ("sales.edit", "Edit Deals", "Can edit existing deals", "Sales"),
    ("sales.delete", "Delete Deals", "Can delete deals", "Sales"),
    ("sales.leads.manage", "Manage Leads", "Can create, edit, delete leads", "Sales"),
    ("sales.quotes.manage", "Manage Quotes", "Can create and send quotes", "Sales"),
    ("sales.targets.view", "View Targets", "Can view sales targets", "Sales"),
    ("sales.targets.set", "Set Targets", "Can set sales targets for team", "Sales"),
    ("sales.commissions.view", "View Commissions", "Can view commission reports", "Sales"),
    ("stock.view", "View Stock", "Can view inventory levels", "Stock"),
    ("stock.create", "Add Products", "Can add new products", "Stock"),
    ("stock.edit", "Edit Products", "Can edit product details", "Stock"),
    ("stock.delete", "Delete Products", "Can delete products", "Stock"),
    ("stock.adjust", "Adjust Stock", "Can make stock adjustments", "Stock"),
    ("stock.transfer", "Transfer Stock", "Can transfer stock between warehouses", "Stock"),
    ("stock.purchase orders", "Manage Purchase Orders", "Can create and manage POs", "Stock"),
    ("stock.stocktake", "Manage Stock Takes", "Can perform physical stock takes", "Stock"),
    ("finance.view", "View Finance", "Can view financial data", "Finance"),
    ("finance.invoices.manage", "Manage Invoices", "Can create and send invoices", "Finance"),
    ("finance.expenses.manage", "Manage Expenses", "Can record and approve expenses", "Finance"),
    ("finance.reports.view", "View Financial Reports", "Can view P&L, balance sheet", "Finance"),
    ("finance.budgets.manage", "Manage Budgets", "Can set and edit budgets", "Finance"),
    ("finance.payments.process", "Process Payments", "Can record incoming/outgoing payments", "Finance"),
    ("hr.view", "View HR", "Can view employee directory", "HR"),
    ("hr.employees.manage", "Manage Employees", "Can add, edit, remove employees", "HR"),
    ("hr.attendance.manage", "Manage Attendance", "Can track and manage attendance", "HR"),
    ("hr.leave.manage", "Manage Leave", "Can approve/reject leave requests", "HR"),
    ("hr.payroll.view", "View Payroll", "Can view payroll data", "HR"),
    ("hr.payroll.manage", "Manage Payroll", "Can process payroll", "HR"),
    ("hr.performance.manage", "Manage Reviews", "Can conduct performance reviews", "HR"),
    ("projects.view", "View Projects", "Can view projects", "Projects"),
    ("projects.create", "Create Projects", "Can create new projects", "Projects"),
    ("projects.edit", "Edit Projects", "Can edit project details", "Projects"),
    ("projects.delete", "Delete Projects", "Can delete projects", "Projects"),
    ("projects.tasks.manage", "Manage Tasks", "Can create and assign tasks", "Projects"),
    ("projects.time.view", "View Time Tracking", "Can view time tracking data", "Projects"),
    ("crm.view", "View CRM", "Can view contacts", "CRM"),
    ("crm.contacts.manage", "Manage Contacts", "Can add, edit, delete contacts", "CRM"),
    ("crm.interactions.log", "Log Interactions", "Can log customer interactions", "CRM"),
    ("reports.view", "View Reports", "Can view reports", "Reports"),
    ("reports.export", "Export Reports", "Can export reports to PDF/CSV", "Reports"),
    ("reports.custom", "Custom Reports", "Can create custom reports", "Reports"),
    ("settings.view", "View Settings", "Can view settings", "Settings"),
    ("settings.company", "Company Settings", "Can edit company info", "Settings"),
    ("settings.users.manage", "Manage Users", "Can add, edit, remove users", "Settings"),
    ("settings.roles.manage", "Manage Roles", "Can create and edit roles", "Settings"),
    ("settings.integrations", "Manage Integrations", "Can connect third-party apps", "Settings"),
]

ALL_PERM_IDS = [p[0] for p in ALL_PERMISSIONS]

ROLE_DEFS = [
    ("owner", "Owner", "Full access to everything.", "#af9164", True, ALL_PERM_IDS),
    ("admin", "Admin", "Full access except company settings.", "#6f1a07", True,
     [p for p in ALL_PERM_IDS if p not in ("settings.company", "settings.users.manage", "settings.roles.manage")]),
    ("manager", "Manager", "Can manage team, view reports, approve requests.", "#6f5a3a", False,
     ["dashboard.view",
      "sales.view", "sales.create", "sales.edit", "sales.leads.manage", "sales.targets.view", "sales.commissions.view",
      "stock.view", "stock.create", "stock.edit", "stock.adjust",
      "finance.view", "finance.invoices.manage", "finance.reports.view",
      "hr.view", "hr.employees.manage", "hr.attendance.manage", "hr.leave.manage",
      "projects.view", "projects.create", "projects.edit", "projects.tasks.manage",
      "crm.view", "crm.contacts.manage", "crm.interactions.log",
      "reports.view", "reports.export"]),
    ("sales_rep", "Sales Representative", "Can manage leads, deals, quotes, and contacts.", "#10B981", False,
     ["dashboard.view",
      "sales.view", "sales.create", "sales.edit", "sales.leads.manage", "sales.quotes.manage",
      "crm.view", "crm.contacts.manage", "crm.interactions.log",
      "reports.view"]),
    ("inventory_mgr", "Inventory Manager", "Can manage products, stock, and purchase orders.", "#F59E0B", False,
     ["dashboard.view",
      "stock.view", "stock.create", "stock.edit", "stock.adjust", "stock.transfer", "stock.purchase orders", "stock.stocktake",
      "reports.view"]),
    ("accountant", "Accountant", "Can manage invoices, expenses, and view financial reports.", "#3B82F6", False,
     ["dashboard.view",
      "finance.view", "finance.invoices.manage", "finance.expenses.manage", "finance.reports.view", "finance.budgets.manage", "finance.payments.process",
      "reports.view", "reports.export"]),
    ("employee", "Employee", "Basic access to dashboard and assigned tasks.", "#64748B", False,
     ["dashboard.view", "projects.view", "crm.view"]),
]

DEMO_USERS = [
    ("super@onegemmy.com", "Super Admin", "super123", "super_admin", None, None, None),
    ("admin@onegemmy.com", "Company Admin", "admin123", "company_admin", "owner", "c_main", "s_main"),
    ("manager@onegemmy.com", "Shop Manager", "manager123", "user", "manager", "c_main", "s_main"),
    ("sales@onegemmy.com", "Sales Rep", "sales123", "user", "sales_rep", "c_main", "s_main"),
    ("staff@onegemmy.com", "Shop Staff", "staff123", "user", "employee", "c_main", "s_main"),
]


def seed_all(db: Session):
    _seed_permissions(db)
    company, shops = _seed_company_and_shops(db)
    role_map = _seed_roles(db, company)
    _seed_users(db, role_map, company, shops)


def _seed_permissions(db: Session):
    if db.query(Permission).count() > 0:
        return
    for perm_id, name, desc, module in ALL_PERMISSIONS:
        db.add(Permission(id=perm_id, name=name, description=desc, module=module))
    db.commit()


def _seed_company_and_shops(db: Session):
    company = db.query(Company).filter(Company.slug == "gemmy-connect").first()
    if not company:
        company = Company(name="Gemmy Connect Ltd", slug="gemmy-connect", plan="professional")
        db.add(company)
        db.commit()
        db.refresh(company)

    shops = {}
    if db.query(Shop).filter(Shop.company_id == company.id).count() == 0:
        s1 = Shop(company_id=company.id, name="Kigali Main Store", location="Kigali, Rwanda")
        s2 = Shop(company_id=company.id, name="Nyamirambo Branch", location="Nyamirambo, Kigali")
        db.add_all([s1, s2])
        db.commit()
        db.refresh(s1)
        db.refresh(s2)
        shops = {"s_main": s1, "s_branch": s2}
    else:
        existing = db.query(Shop).filter(Shop.company_id == company.id).all()
        shops = {f"s_{i}": s for i, s in enumerate(existing)}

    return company, shops


def _seed_roles(db: Session, company: Company):
    role_map = {}
    for role_key, name, desc, color, is_system, perm_ids in ROLE_DEFS:
        existing = db.query(Role).filter(Role.name == name, Role.company_id == company.id).first()
        if existing:
            role_map[role_key] = existing
            continue
        role = Role(company_id=company.id, name=name, description=desc, color=color, is_system=is_system)
        perms = db.query(Permission).filter(Permission.id.in_(perm_ids)).all()
        role.permissions = perms
        db.add(role)
        db.flush()
        role_map[role_key] = role
    db.commit()
    return role_map


def _seed_users(db: Session, role_map, company, shops):
    for email, name, password, platform_role, role_name, comp_key, shop_key in DEMO_USERS:
        if db.query(User).filter(User.email == email).first():
            continue
        role_id = role_map[role_name].id if role_name and role_name in role_map else None
        comp_id = company.id if comp_key == "c_main" else None
        shop_id = shops[shop_key].id if shop_key and shop_key in shops else None
        db.add(User(
            email=email, name=name,
            hashed_password=get_password_hash(password),
            platform_role=platform_role,
            role_id=role_id, company_id=comp_id, shop_id=shop_id,
        ))
    db.commit()
