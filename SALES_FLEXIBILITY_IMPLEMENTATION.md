# Sales Flexibility Implementation

## Core rule
Physical sale-side stock movement remains Challan-first. Sales Orders, public/web orders, invoices and payments do not independently deduct finished-goods inventory. A finalized Sale Challan is the authoritative outgoing movement.

## Phase 1 — Core flexibility
- Flexible Sales Order fields: customer, warehouse, billing/shipping, PO number, expected date, priority, terms, attribution.
- Partial fulfillment and backorders with multiple Challans per order.
- Customer-specific pricing integration and volume pricing.
- Configurable Buy X Get Y / discount schemes.
- Credit-limit projection and configurable approval policy.
- Customer categories expanded for wholesaler, clinic, institution, pharmacy and other.

## Phase 2 — Operations
- Quick Sale creates an approved Sales Order plus a draft Sale Challan in one operation.
- Split delivery is supported by multiple fulfillment Challans.
- FEFO batch allocation when a batch is not explicitly selected; explicit batch selection is preserved.
- Split-tender invoice payments (Cash/UPI/Bank Transfer/Cheque).
- Controlled sales returns with original-Challan validation, incoming stock ledger posting and optional credit note.
- Configurable approval policy stored in System Settings.

## Phase 3 — Management
- MR/salesperson/source attribution stored on orders.
- Configurable commission rules with percentage/slab support.
- Sales dashboard with sales, orders, invoices, collections, approvals and partial fulfillment.
- Sales attribution reporting.
- Customer and product sales analytics.
- Unified search across customers, orders, Challans, invoices and products.
- New Sales Workspace screen in the Sales sidebar.

## New API surface
- `GET /api/sales-workflow/dashboard`
- `POST /api/sales-workflow/orders`
- `POST /api/sales-workflow/orders/:id/fulfill`
- `POST /api/sales-workflow/orders/:id/reconcile-fulfillment`
- `POST /api/sales-workflow/quick-sale`
- `GET /api/sales-workflow/availability/:productId`
- `POST /api/sales-workflow/invoices/:id/split-payment`
- `GET/POST /api/sales-workflow/returns`
- `POST /api/sales-workflow/returns/:id/post`
- `GET/POST/PUT /api/sales-workflow/schemes`
- `GET/POST /api/sales-workflow/commission-rules`
- `GET /api/sales-workflow/commissions`
- `GET/PUT /api/sales-workflow/policy`
- `GET /api/sales-workflow/search`
- `GET /api/sales-workflow/analytics`

## Important migration note
No destructive migration is run automatically. Existing Orders remain valid because all new fields have defaults. New compound indexes will be created through the normal Mongoose index lifecycle used by the project. Validate indexes in staging before production deployment.

## Validation performed in this build
- JavaScript syntax audit across all server `.js` files: passed.
- TypeScript parser check of the new Sales Workspace: no TS1xxx syntax errors.
- Full frontend compile/Jest suite not executed because project dependencies are not installed in this execution environment.
