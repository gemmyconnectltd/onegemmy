# Curated library of starter department templates a tenant can browse and
# import from on the HR > Departments page, mirroring the Inventory > Categories
# template-import pattern. Each "group" is a UI-only grouping for browsing —
# imported departments are always flat (see Department model). Far fewer
# templates than the category library on purpose: department structure barely
# varies by industry compared to product categories, so a handful of curated
# org shapes covers nearly every business.

DEPARTMENT_TEMPLATES: list[dict] = [
    {
        "id": "general-business", "name": "General Business", "industry": "General",
        "groups": [
            {"name": "Core Functions", "items": ["Sales", "Finance & Accounting", "Operations"]},
            {"name": "Support Functions", "items": ["Human Resources", "Marketing", "Customer Service"]},
        ],
    },
    {
        "id": "retail-shop", "name": "Retail & Shop", "industry": "Retail",
        "groups": [
            {"name": "Core Functions", "items": ["Sales & Checkout", "Inventory & Stock", "Procurement & Purchasing"]},
            {"name": "Support Functions", "items": ["Finance & Accounting", "Human Resources", "Customer Service"]},
        ],
    },
    {
        "id": "wholesale-distribution", "name": "Wholesale & Distribution", "industry": "Wholesale",
        "groups": [
            {"name": "Core Functions", "items": ["Sales & Accounts", "Warehouse & Logistics", "Procurement"]},
            {"name": "Support Functions", "items": ["Finance & Accounting", "Human Resources", "Fleet & Delivery"]},
        ],
    },
    {
        "id": "manufacturing", "name": "Manufacturing", "industry": "Manufacturing",
        "groups": [
            {"name": "Core Functions", "items": ["Production", "Quality Control", "Procurement & Supply Chain"]},
            {"name": "Support Functions", "items": ["Warehouse & Logistics", "Finance & Accounting", "Human Resources"]},
        ],
    },
    {
        "id": "services", "name": "Service Business", "industry": "Services",
        "groups": [
            {"name": "Core Functions", "items": ["Service Delivery", "Scheduling & Bookings", "Customer Support"]},
            {"name": "Support Functions", "items": ["Finance & Accounting", "Human Resources", "Marketing"]},
        ],
    },
    {
        "id": "hospitality", "name": "Hospitality", "industry": "Hospitality",
        "groups": [
            {"name": "Core Functions", "items": ["Front Desk & Reservations", "Food & Beverage", "Housekeeping"]},
            {"name": "Support Functions", "items": ["Finance & Accounting", "Human Resources", "Procurement"]},
        ],
    },
    {
        "id": "healthcare-pharmacy", "name": "Healthcare & Pharmacy", "industry": "Healthcare",
        "groups": [
            {"name": "Core Functions", "items": ["Dispensing & Pharmacy", "Patient Services", "Compliance & Regulatory"]},
            {"name": "Support Functions", "items": ["Inventory & Procurement", "Finance & Billing", "Human Resources"]},
        ],
    },
]
