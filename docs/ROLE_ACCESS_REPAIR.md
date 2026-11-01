# Repair existing users who see only Help & Support

Run against the deployed backend environment/database, not a local development database.
The diagnostic report distinguishes missing role links, missing built-in role permissions,
empty custom roles, business restrictions and user-disabled modules. Matching a role name
alone does not establish what went wrong on a particular server.

From `backend/`, preview one business:

```sh
.venv/bin/python -m scripts.repair_role_access --tenant BUSINESS_SLUG
```

Review `role_repairs` and `users_without_role`. Explicitly restore missing template grants:

```sh
.venv/bin/python -m scripts.repair_role_access --tenant BUSINESS_SLUG --apply --operator "Operator name" --reason "Restore missing role access for existing users"
```

Use `--all-tenants` instead of `--tenant BUSINESS_SLUG` only when intending to repair every
business. Each business commits independently, with an immutable audit entry. Re-running
is safe. Default preview is enforced as a read-only database transaction.

This repairs all built-in role types, including users already assigned to those roles.
It links legacy users with a missing role ID to the role named on their existing account.
It adds missing template permissions and preserves extra grants; deliberate revocations
will therefore be restored when explicitly applying this maintenance operation. Unknown
custom roles are reported rather than converted to Member/Admin. Empty custom roles need
an owner to choose their actual permissions. No branch assignments, superuser flags,
subscription entitlements or disabled-module settings are changed.

After applying, affected users should sign out and back in: the frontend currently restores
permissions from the login token. A role repair cannot enable modules excluded by the plan
or deliberately disabled by the business/user settings. Existing roles keep their intended
limits; Viewer remains read-only and Cashier remains limited to cashier work.
