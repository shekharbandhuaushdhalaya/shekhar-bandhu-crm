# Sales, MR and Customer Self-Service implementation — 2026-09-12

Implemented on top of `final-crm-sales-all-phases.zip`.

## Sales
- Customer 360 with commercial/activity timeline
- Action Center for partial orders, approvals, overdue invoices, promises and dormant customers
- Payment Promise workflow and missed-promise detection
- Lost Sales tracking and reason/product analysis
- Estimated margin report
- Repeat order from prior Sales Order
- Fixed volume-tier pricing to use `fixedRate`
- Fixed scheme audience matching so customer/category-specific schemes do not leak to unrelated customers

## MR
- My Day endpoint and UI
- A/B/C coverage tracking and missed Priority-A accounts
- Visit outcome, type, follow-up, joint-working and promoted-products fields
- Focus product targets and achievement
- Competitor intelligence
- Promotion / visit → order → sales attribution
- Field expense / ROI metrics

## Customer self service
- Tenant-bound customer portal JWTs
- Customer account dashboard/profile
- Customer-specific catalog pricing and schemes
- Product detail/availability
- Idempotent website checkout via `clientOrderRef`
- Website orders create Sales Orders only (no physical stock movement)
- Repeat order
- Existing order tracking/invoices/ageing retained
- Admin endpoint to enable/disable portal access and set hashed password
- Framework-agnostic website API client in `integration/customerPortalClient.js`

## Validation performed
- Every JavaScript file under `server/` passed `node -c` syntax validation.
- New/modified TSX navigation screens passed TypeScript `transpileModule` parser validation.
- Full Expo/TypeScript dependency build was not runnable because project dependencies are not installed in this environment.

## Website project status
The separate website project did not appear in the available conversation files during this pass. Its actual source files were therefore not modified. The CRM-side API contract and reusable website client are complete and ready to integrate when the website ZIP/folder is available.
