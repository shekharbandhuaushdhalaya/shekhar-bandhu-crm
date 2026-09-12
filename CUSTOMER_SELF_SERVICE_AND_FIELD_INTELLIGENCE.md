# Customer Self-Service + Sales/MR Intelligence

## Inventory rule preserved
Website/customer portal orders **never deduct physical inventory**. They create a `Sales Order` with `orderChannel=website`. Goods move only when an internal user prepares and finalizes a Sale Challan. This keeps the Challan as the truth document.

## Customer self-service API
Authentication is tenant-bound. `/api/portal/auth/login` is resolved through the configured public firm (`PUBLIC_FIRM_ID` in production) and the signed customer token contains `firmId`.

- `POST /api/portal/auth/login`
- `GET /api/portal/me`
- `GET /api/portal/dashboard`
- `GET /api/portal/catalog?q=&page=&limit=` — customer pricing + availability
- `GET /api/portal/catalog/:id?qty=` — price tiers + scheme + availability
- `POST /api/portal/orders` — order submission, supports `clientOrderRef` idempotency
- `GET /api/portal/orders`
- `POST /api/portal/orders/:id/repeat`
- `GET /api/portal/orders/:id/track`
- `GET /api/portal/invoices`
- `GET /api/portal/invoices/:id/pdf`
- `GET /api/portal/receivables-ageing`

Admin can manage customer website access with:

- `PUT /api/customers/:id/portal-access`
  - `{ "enabled": true, "email": "buyer@example.com", "password": "minimum8chars" }`
  - Passwords are hashed with bcrypt and are never returned.

## Website pages to connect
The separate website should expose these authenticated pages:

1. **Sign in** → `/portal/auth/login`
2. **My Account / Dashboard** → `/portal/dashboard`, `/portal/me`
3. **Products / Catalog** → `/portal/catalog`
4. **Product Detail** → `/portal/catalog/:id`
5. **Cart / Checkout** → `/portal/orders`
6. **My Orders** → `/portal/orders`
7. **Order Tracking** → `/portal/orders/:id/track`
8. **Repeat Order** → `/portal/orders/:id/repeat`
9. **Invoices** → `/portal/invoices`
10. **Outstanding / Statement** → `/portal/receivables-ageing`

A framework-agnostic client is included at `integration/customerPortalClient.js`.

## Sales intelligence added
New `/api/sales-intelligence` endpoints:

- `/action-center` — partial orders, approvals, payment promises, dormant customers, overdue invoices
- `/customers/:id/360` — orders, challans, invoices, payments, visits, promises, credit health, activity timeline
- `/orders/:id/repeat`
- `/collections`
- `/payment-promises`
- `/lost-sales`
- `/margin-report`

Admin UI: **Sales Intelligence** screen with Action Center, Customer 360, Collections, Lost Sales and Margin tabs.

## MR field intelligence added
New `/api/mr-field` endpoints:

- `/:mrId/my-day`
- `/:mrId/coverage`
- `/:mrId/focus-products`
- `/:mrId/competitors`
- `/:mrId/attribution`

MR visits now support visit type, outcome, follow-up date, joint working and promoted-product response.

Admin UI: **MR My Day** screen showing today's work, follow-ups, collections, A-category coverage gaps, focus-product achievement and field effectiveness.

## New persistence
- `PaymentPromise`
- `LostSale`
- `FocusProduct`
- `CompetitorObservation`

## Production configuration
For the website deployment:

- Put the website origin in exact `ALLOWED_ORIGINS`.
- Set `PUBLIC_FIRM_ID` to the firm that owns the public website/storefront.
- Keep `JWT_SECRET` server-only.
- Never expose CRM admin JWTs to the public website.
- Use `clientOrderRef` for every website checkout submission so browser retries cannot create duplicate orders.
