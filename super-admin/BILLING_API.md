# Plans & Billing API

Both apps use the authoritative backend in `backend/app/modules/billing/`.
The old browser demo service and its sample financial records have been removed.
See [billing architecture, policies and deployment](../backend/docs/billing.md).

All paths are under `/api/v1`, use existing auth and shared response envelopes. Lists are paginated
(maximum 100), with search/status/currency/plan/date filters where relevant. Money is integer minor units.

| Operation | Super Admin | Tenant ERP |
|---|---|---|
| Plan catalogue | `GET /admin/billing/plans` | `GET /tenants/billing/plans` (active only) |
| Create/version plan | `POST /admin/billing/plans`, `PUT /admin/billing/plans/{id}` | Not permitted |
| Price history | `GET /admin/billing/plans/{id}/prices` | Agreement snapshot in overview |
| Billing overview | `GET /admin/billing/overview` | `GET /tenants/billing/overview` |
| Existing business subscription | `GET /admin/billing/tenants/{id}` | Uses authenticated tenant automatically |
| Preview change | `POST /admin/billing/tenants/{id}/preview` | `POST /tenants/billing/preview` |
| Confirm quote | `POST /admin/billing/tenants/{id}/confirm` | `POST /tenants/billing/confirm` |
| Cancel/withdraw cancellation | `POST /admin/billing/tenants/{id}/subscription` | `POST /tenants/billing/subscription` |
| Approve discount/extend trial | Same admin subscription action endpoint, with reason | Not permitted |
| Subscriptions/invoices/payments/refunds | `GET /admin/billing/{kind}` | Own records: `GET /tenants/billing/{kind}` |
| Subscription audit history | `GET /admin/billing/subscriptions/{id}/history` | Existing invoice/payment history |
| Invoice detail/download | `GET /admin/billing/invoices/{id}[ /pdf]` | `GET /tenants/billing/invoices/{id}[ /pdf]` |
| Receipt download | Invoice PDF endpoint with `?receipt=<verified-payment-reference>` | Same, own invoice only |
| Credit note download | `GET /admin/billing/refunds/{id}/pdf` | `GET /tenants/billing/refunds/{id}/pdf` |
| Available methods | `GET /admin/billing/payment-methods` | `GET /tenants/billing/payment-methods` |
| Pay invoice | Customer-initiated in tenant ERP | `POST /tenants/billing/invoices/{id}/pay` |
| Reconcile deposit | `POST /admin/billing/payments/{reference}/refresh` | Same own-reference path under `/tenants/billing` |
| Authorize/reconcile refund | `POST /admin/billing/payments/{reference}/refund`, `POST /admin/billing/refunds/{reference}/refresh` | Not permitted |
| Billing policy | `GET/PUT /admin/billing/settings` | Not permitted |

Financial mutations require `Idempotency-Key`. Plan updates require `expected_version`. Change confirmations
accept only an actor-bound server quote ID; no client-submitted price is accepted. Payment initiation sends
phone/provider, while amount/currency come from the locked invoice. pawaPay callbacks trigger authenticated
status read-back and never expose billing records in their public response. No endpoint marks an arbitrary
payment paid. Refund approval creates a separate, immutable credit note after provider verification.

There is no live coupon engine or subscription pause workflow inherited from the old demo. Approved
business discounts are managed on each subscription and audited. Supported pawaPay authorization methods
are discovered from the merchant's active configuration; unsupported methods never appear as fake controls.
