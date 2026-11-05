# Standard roles

Every business gets these built-in role templates (`backend/app/modules/tenants/service/role.py`, `FOCUSED_ROLES` and the base roles). Seeding only adds roles that are missing, never changes a role a business already has (including one it made by hand with the same name), and never assigns anyone to a new role.

Add them to businesses created before they existed: `cd backend && .venv/bin/python -m scripts.seed_standard_roles [--dry-run]`. New businesses and the "Restore defaults" button on Roles & Permissions get them automatically.

## Mapping of the requested roles
Reused (no duplicate created): **Procurement Manager** = Purchasing Manager, **Storekeeper** = Warehouse Keeper (both also resolve by their requested name when inviting), **Factory Manager**, **Service Technician**, **Receptionist** already existed.

| Department | Roles |
|---|---|
| Administration | Admin, Owner/CEO, General Manager, Branch Manager, Operations Manager, Member, Viewer |
| Sales & Retail | Cashier, Cashier Supervisor, Store Manager, Sales Manager, Sales Supervisor, Sales Representative, Sales Operations Officer |
| Inventory & Warehouse | Inventory Officer, Inventory Manager, Warehouse Manager, Warehouse Keeper, Stock Controller, Stock Counter, Delivery / Dispatch Officer |
| Finance & Accounting | Accountant, Finance Manager, Financial Controller, Accounts Receivable Officer, Accounts Payable Officer, Expense Officer, Credit Controller, Treasury Officer, Tax Officer |
| Purchasing | Purchasing Officer, Purchasing Manager, Procurement Assistant |
| Human Resources | HR Manager, HR Officer, Payroll Officer, Recruitment Officer, Attendance Officer |
| Manufacturing | Factory Manager, Production Manager, Production Supervisor, Quality Control Officer, Machine Operator |
| Services | Service Manager, Service Advisor, Service Technician, Receptionist |
| CRM | CRM Manager, Customer Success Manager, Customer Support Agent, Marketing Officer |
| IT & Compliance | Auditor, Compliance Officer, IT Administrator |

## Rules every template follows
- Permissions are only the existing `resource:action` ones. No new permissions were introduced.
- No job role has `delete`. Deleting stays with owners and administrators, in the UI and on the server.
- No job role has `users`, `roles`, `permissions`, `billing` or `tenants` write access. IT Administrator can only read the team.
- Those who prepare cannot approve (Expense Officer, Accounts Payable Officer, Procurement Assistant, Stock Counter, Treasury Officer). Review roles approve and do not enter (Financial Controller). Auditor and Compliance Officer are read-only.
- Departments are for organising pickers; they grant nothing.

## Known limits
- **Scope is per user, not per role.** A role says what a person can do; the branches they can do it in come from their branch assignment (enforced on the server). Warehouse-level restriction does not exist; branch is the finest scope.
- **Read/update is business-wide for everyone.** The platform policy gives every business user read and update on operational areas, so a template can add create and approve but cannot take read/update away. Least privilege is exact for create, approve and delete only.
- **Integration Manager is not created:** PESAA has no integrations module or permission for it to manage.
- **IT Administrator** cannot reset passwords or change roles; those need owner-level permissions that this template deliberately does not carry.
- **Treasury Officer** can record cash and bank entries but transfers need a journal approver, so transfers stay with the Financial Controller or Finance Manager.
- Self-approval is already blocked for approval requests (nobody decides their own).
