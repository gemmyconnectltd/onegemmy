# Operational view and edit access

Active users belonging to a business have baseline `read` and `update` access across
operational ERP resources. This applies to existing users, including accounts with a missing
role link or empty role grants, without modifying the database or assigning a broader role.
Login, token refresh and `/tenants/users/me` publish the same effective permission names;
the frontend's current-session refresh picks them up after backend deployment.

Explicit role grants still govern creation, deletion and approval. In particular, the coarse
POST gate uses stored role grants so an automatic `update` grant cannot inadvertently authorize
creation or payments. Existing endpoint-specific validation and approval workflows remain.

Tenant/branch ownership, authentication, disabled modules and subscription/business feature
availability remain enforced. Tenant settings, users, roles, permissions, branches, billing,
approval authority and credit-control administration receive no automatic grants. Platform
and inactive accounts receive no business baseline. Existing explicit permissions are retained.

`app/core/permission_policy.py` defines the operational resource set. `User.permissions_names`
combines it with stored role grants; `User.role_permissions_names` exposes only stored grants.
The role-repair script is optional for restoring explicit template grants above this baseline;
it is no longer required just to give an active business user operational view/edit access.
