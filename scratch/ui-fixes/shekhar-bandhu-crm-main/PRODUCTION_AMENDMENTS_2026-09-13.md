# Production Amendments — 2026-09-13

This snapshot applies the highest-priority corrections identified during the
real-world readiness audit. It is still a release candidate, not a substitute
for staging certification with a real MongoDB replica set and provider
credentials.

## Applied

- Website orders now open the Sales Workspace for Sales Order → draft Sale
  Challan fulfillment. Retired direct Order → Invoice and Order → shipped /
  delivered UI actions were removed.
- Customer ledgers now read finalized, posted Sale Challans instead of the
  retired StockMovement engine.
- Challan listing supports customer and mode filters for ledger queries.
- Batch traceability reads the current Challan collection.
- GST exports use the configured firm GSTIN and fail closed when it is absent;
  fake GSTIN and placeholder export hash values were removed.
- E-Way Bill payload preparation no longer fabricates firm, address,
  transporter, vehicle, or customer-address data.
- Challan-derived invoices now retain firm details for downstream documents.
- Login MFA preserves the selected firm. OTP generation uses cryptographic
  randomness and OTP/reset attempts are capped.
- Session listing and revocation now operate on RefreshSession records.
- Payment reversals are retained as immutable `reversed` records instead of
  deleting the original receipt; allocation and reversal actions are audited.
- Idempotency middleware was added to Challan conversion, Dispatch creation,
  Sales Order fulfillment, Sales Order creation, and Quick Sale creation.
- Production message paths fail closed when a real provider is unavailable;
  no hardcoded doctor phone is used for MR notifications.
- Mobile tab visibility now respects the MR permission for the MR My Day tab.
- Retired StockMovement write methods and direct Order invoice API methods were
  removed from the frontend API client.

## Validation

- Backend JavaScript syntax check: passed.
- Expo TypeScript check: passed.
- Expo web export: passed.
- Full Jest and real MongoDB transaction/concurrency certification still need
  to run in the project environment with backend dependencies and a replica
  set available.
