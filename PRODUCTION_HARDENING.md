# Production hardening applied

This release includes the following production-readiness changes:

- Exact HTTPS CORS allowlisting in production. Vercel/Render wildcard trust is development-only.
- Explicit `X-Firm-Id` / JWT firm selection can no longer silently fall back to another firm.
- Refresh-token rotation is atomically consumed to prevent concurrent reuse.
- Refresh flow handles deleted users safely.
- HTTP keep-alive, header, and request timeouts are explicitly configured.
- Helmet headers are applied before static uploads.
- Upload caching is enabled only in production and dotfiles are denied.
- Access logs record request paths instead of raw URLs, avoiding query-string credential/code leakage.
- Unknown routes return a consistent JSON 404 with request ID.
- Audit-log search is regex-escaped and bounded; dates are validated; pagination is capped.
- Production seeding is rejected if users already exist, preventing accidental partial/demo reseeding.
- Container healthcheck targets `/api/ready`.
- GitHub Actions release gates run backend install/lint/tests and frontend TypeScript/web export checks.

## Validation performed in this workspace

- Node syntax check passed for all 289 server JavaScript files.
- Production configuration checks passed for exact-origin enforcement and short-JWT rejection.
- Full dependency-backed lint/Jest/frontend builds could not be run in this workspace because the uploaded project does not contain its dependency tree and package installation was unavailable/time-limited. CI is configured to run those gates with `npm ci`.

## Additional release polish
- Added a GitHub Actions production gate workflow for backend lint/tests and frontend TypeScript/web export.
- Added SPA fallback and baseline security headers to the frontend Nginx image.
- Added a 30-second API request timeout and clearer 429/network errors in the frontend client.
- ErrorBoundary no longer exposes exception details in production builds.
- Modernized the manufacturing modal shell with a wider, calmer, more premium layout and stronger hierarchy.

## Challan as the authoritative goods-transfer document

Sale-side physical dispatches and internal/production transfers are now modeled around the `Challan` document. A posted Challan is immutable and is the only document allowed to perform the corresponding physical sale/transfer stock movement. Invoices and payments do not deduct inventory.

For manufacturing completion, finished goods are first received into the manufacturing unit's linked manufacturing warehouse. The system then automatically creates a draft `production_transfer` Challan from that production house to the destination warehouse selected by the user. Finalizing that Challan atomically moves the goods from the production house to the destination and writes the stock ledger entries.

## Challan-Centric Inventory Hardening (2026-09-12)

- Sale-side physical dispatches are controlled by the sale Challan.
- Internal warehouse transfers are represented by Transfer Challans; legacy StockTransfer shipment now creates/posts the authoritative Challan and receipt only changes logistics status.
- Production completion receives finished goods into the manufacturing warehouse and atomically creates a draft Production Transfer Challan to the user-selected destination.
- Challan posting is transactional and idempotent; internal transfers are neutral to firm-wide Product.stockLevel.
- Posted Challans are immutable and support compensating reversal.
- Inventory reconciliation is available at `GET /api/inventory/reconciliation`.
- Sale invoices that attempt a direct physical stock deduction now return `SALE_CHALLAN_REQUIRED` (sampling/damage exception flows remain supported).
- Idempotency keys are tenant-scoped and stale processing records can recover after ten minutes.
