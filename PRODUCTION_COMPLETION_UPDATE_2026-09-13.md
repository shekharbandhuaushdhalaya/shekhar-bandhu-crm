# Production completion update — 13 September 2026

This snapshot contains the remaining code-level hardening from the deep audit.

## Included

- Production-only `Idempotency-Key` enforcement for dispatches, payments,
  inventory receipts/adjustments, raw-material receipts/purchases/adjustments,
  GRNs, Challan-to-invoice conversion, split payments and sales returns.
- Inventory and raw-material movements retain movement keys, run in MongoDB
  transactions, and emit audit records. Raw-material entries with quantity may
  not be deleted; they must be adjusted through the approved workflow.
- Gateway payments carry a unique provider transaction ID to prevent duplicate
  webhook postings.
- Public GSTIN verification is format-only and clearly reports that taxpayer
  details require an authoritative GST/GSP provider.
- Public product ratings use a tenant-scoped daily device fingerprint to stop
  repeated anonymous amplification.
- WhatsApp broadcasts persist as campaigns and execute through the durable job
  queue, with per-recipient status and provider failure recording.
- Read-only inventory reconciliation compares InventoryEntry slots, StockLedger
  totals, and posted Sale Challans. It is available from the CRM drawer.
- Production preflight and database-index verification scripts, CI gates,
  deployment integration variables, API error-code documentation, and runbook
  procedures are included.
- Standalone Sale Invoice creation is removed from the CRM UI; invoice creation
  continues through a posted Sale Challan.

## Validation performed in this workspace

- Backend JavaScript syntax: all files pass `node --check`.
- CRM TypeScript: `tsc --noEmit` passes.
- Expo web export: passes with an explicit API URL.
- ZIP integrity: run before delivery.

## Required release-owner checks

These require the deployment's real infrastructure and credentials and cannot
be certified from an archive alone: MongoDB replica-set transaction tests,
tenant-isolation/concurrency tests against staging, provider webhook replay
tests, `npm ci`/Jest/ESLint with the deployment lockfiles, backup restore, and
mobile-device acceptance. Run the commands in `PRODUCTION_RUNBOOK.md` and
archive the reconciliation report with the release record.
