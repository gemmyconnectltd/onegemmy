# Feature access management

Platform administrators manage each business under **Tenants → business → Subscription → Business feature access**. Turning a platform switch off restricts that module for the whole business. Removing a restriction preserves the owner's business switches and employee settings. Plan entitlements still apply when enforced.

Business owners manage each employee under **Settings → Team & Access → person → Feature access**. Turning an employee switch off blocks reads and writes for that module on the server. Turning it on restores the active employee's default operational view/edit and checkout access plus their assigned role permissions. It cannot override a platform restriction or a plan entitlement. A business module turned off by its owner remains readable but refuses writes.

The access overview and employee list include the default operational access, even for existing users without stored role grants. Role editing continues to show the role's stored grants. Owners retain access to the modules available to their business; branch scope remains independently enforced.

Ordinary Member accounts need an explicit management permission to change users, roles, or business settings. The operational Member bypass does not authorize these management actions. Owner/admin accounts and explicitly authorized delegates can manage them.

No migration or bulk role rewrite is required. Deploy backend, ERP frontend, and super-admin together. Signed-in ERP users refresh their server profile periodically and can use Refresh access on a blocked module page.

Platform administrators can also open **Tenants → business → User feature access → Manage features** to review a paginated employee list, preview effective module access and branch scope, and change employee switches. These audited switches are shared with owner management. They cannot bypass business restrictions, and owners cannot be restricted through employee switches. The preview reports access rather than impersonating the account; all published ERP sidebar entries remain visible.
