# CRM Stabilization Handoff — 2026-09-12

## Continuation pass completed later on 2026-09-12

This handoff now describes the updated continuation snapshot. It remains a **staging candidate, not a production-certified release**, because the real-database migration/concurrency gates and a coordinated Expo SDK upgrade have not been completed.

### Confirmed fixes in this continuation

- Fixed stock-transfer creation calling an out-of-scope `generateAtomicDocumentNumber` function.
- Persisted stock-transfer approval/shipping/receipt/cancellation and linked-Challan fields that the old schema silently discarded.
- Made stock-transfer shipping idempotent and linked each transfer to one authoritative transfer Challan.
- Enforced the mandatory `Sales Order -> Sale Challan` rule on create, edit and inventory posting. A Sale Challan can no longer move stock without an active, customer-matched Sales Order.
- Consolidated draft fulfillment into `salesOrderService` so normal orders, quotation conversion and consignment settlement use the same approval, pricing, stock and over-fulfillment controls.
- Changed finalized quotation conversion to create a Sales Order and then a draft Sale Challan instead of bypassing the order layer.
- Changed consignment sold settlement to create a fixed-price Sales Order and authoritative Sale Challan; mixed sold-and-returned submissions are rejected so two workflows cannot partially commit.
- Added stock-transfer/Challan idempotency keys in the frontend.
- Fixed all discovered callers that passed a raw Challan ID to the posting service where a Challan document was required.
- Made late production raw-material backfill part of the same transaction as finished-goods receipt, batch completion and production-transfer Challan creation. It now fails on shortage/concurrent stock changes and includes backfilled material cost in finished-goods unit cost.
- Updated Razorpay tests for the hardened tenant, invoice and gateway-order binding.
- Cleared frontend TypeScript failures, including invalid React Native styles, missing model fields, undefined invoice amounts and stale component typings.
- Removed the deprecated Expo Router Babel plugin.
- Updated dependency lockfiles without forcing a major framework migration. Backend production dependencies now audit cleanly; safe frontend overrides reduced the audit from 35 findings (including one critical) to 8 high findings in the Expo/Metro toolchain.

### Validation completed on this updated snapshot

- Backend JavaScript syntax scan: **PASS**.
- Backend ESLint error gate (`eslint --quiet`): **PASS (0 errors)**. The full non-quiet lint still contains legacy warnings.
- Focused security/config/payment/document validation: **6 suites, 32 tests passed**.
- Frontend TypeScript (`tsc --noEmit`): **PASS**.
- Expo web production export: **PASS**.
- Backend production dependency audit: **PASS, 0 vulnerabilities**.
- Frontend dependency audit: **8 high findings remain**, all in the Expo 54/Metro/image-size chain. npm's offered remediation is a breaking Expo SDK 57 upgrade and must be handled as a coordinated framework migration with regression testing.
- Legacy `StockMovement` production-write scan: no surviving normal production `StockMovement.create` path; mutation endpoints remain retired compatibility surfaces.
- Route-order scan: the generic Contact/MR `/:id` handlers explicitly call `next()` for non-ObjectId static paths.

### Validation limitations and remaining release gates

- The full Jest run reached **34/64 suites and 164/238 tests passing**. Database-backed suites cannot start `mongodb-memory-server` here because this sandbox rejects the downloaded `mongod` process with `std::exception in initAndListen: open: Operation not permitted`. Several legacy mock suites also still encode retired behavior and need modernization.
- Run the transaction/concurrency suites against a real MongoDB replica set or a CI runner that permits `mongod` execution.
- Test `migrate-production.js`, index synchronization, reconciliation, two-firm isolation, backup/restore and role-based browser flows on staging data.
- Plan and test the Expo 54 -> 57 migration before production certification; do not use `npm audit fix --force` blindly.

## Purpose

This file is the handoff for continuing the production-stabilization work on the current CRM codebase in a new chat.

**Use this snapshot as the starting point. Do not go back to an older CRM ZIP.**

The user's goal is to finish a deep end-to-end audit, repair every confirmed break/integration issue, standardize loading/error states, run the final validation gates, and only then call the build production-ready.

## Snapshot status

This ZIP is an **intermediate stabilization snapshot**, not a production-certified release.

Working tree used to create the snapshot:

`/mnt/data/final_stabilize`

At packaging time the tree contained approximately:

- 96 modified tracked files
- 10 new/untracked implementation files
- 430 source files under `server` + `admin-crm` (excluding dependencies)

The current changes are intentionally uncommitted in the source snapshot so the next pass can inspect the full diff against the original repository.

## Non-negotiable business architecture

### Sales physical movement

The Sale Challan is the authoritative physical-goods truth document.

Expected flow:

`Sales Order -> Sale Challan -> posted inventory movement -> Dispatch -> Sale Invoice -> Payment -> Customer balance`

Website/customer self-service orders must create a **Sales Order only**. They must never directly deduct stock.

### Production

Finished production should first be received into the manufacturing/production-house warehouse and then moved to the user-selected destination through a production-transfer Challan.

### MR samples

Physical sample stock should follow:

`Warehouse -> MR Bag -> Doctor`

Issuing a sample to a doctor must not deduct warehouse/product stock a second time.

## Stabilization work already present in this tree

The current working tree contains a broad stabilization pass. Important implemented areas include the following.

### Tenant isolation / security

- Production CORS configuration is intended to use exact configured origins.
- `PUBLIC_FIRM_ID` is required/validated in production.
- Public tenant resolution is designed to fail closed rather than picking the first firm.
- Tenant plugin work was expanded to cover more single-document mutation operations.
- Role/permission work was moved toward firm-scoped behavior and firm-scoped caches.
- Socket.IO work was changed toward firm rooms instead of global cross-tenant broadcasts.
- Customer-portal JWTs are intended to be excluded from staff realtime connections.
- Public enquiry submission was separated from internal query-management operations.
- Public upload handling was hardened.
- Production OTP behavior was changed toward fail-closed behavior instead of silent simulation.
- Meta/social OAuth work was changed toward tenant-bound state handling; this was one of the last areas being rechecked.

### Sales / Challan / Dispatch

- Legacy sale/order `StockMovement` write flows were being retired in favor of the authoritative `Challan` model.
- The old stock movement page was renamed/reframed as operational stock movements instead of another delivery-challan system.
- Sale/order physical fulfillment is intended to go through posted Challans only.
- Dispatch work was rewritten toward posted-authoritative-Challan-only behavior.
- Dispatch/order status work was changed to account for multiple/partial Challans instead of one dispatch marking an entire order delivered.
- Manual Sales Order `shipped`/`delivered` shortcuts were being removed so Dispatch remains the logistics source of truth.
- Challan posting/reversal was moved toward transactional Sales Order fulfillment reconciliation.
- Cancelled/unapproved/over-fulfilled orders should not be able to post stock.
- Challan reversal should refuse when dependent invoice/dispatch documents would make reversal unsafe.
- Sales Workspace now has an authoritative Challans surface rather than sending users to the retired StockMovement flow.

### Scheme/free quantity handling

Current code contains explicit `billableQty` support on Challan lines.

The intended rule is:

- physical `qty` includes paid + free stock moved;
- `billableQty` is the quantity that contributes to invoice value;
- promotional/free units physically move stock but have zero billable value.

This logic is present in the current Challan/return code and must remain intact.

### Returns / credit effects

- Sales return work was moved toward a transactional service.
- Return ownership should be locked to the original Challan/customer.
- Return credit value should be derived from the authoritative original sale pricing rather than client-entered pricing.
- QC disposition distinguishes saleable vs rejected/damaged/expired returned stock.
- A compensating return-reversal flow was being implemented/verified rather than deleting history.

### Payments / receivables

- Payment posting was centralized toward a shared transactional service.
- Split payments were being changed so Invoice/Payment/Customer balance remain synchronized.
- Customer allocations should only target finalized sale invoices for the same customer.
- Vendor allocations should only target finalized purchase invoices for the same vendor.
- Invoice finalization/receivable posting was being separated from Challan inventory posting.
- Manual UI `Mark Paid/Unpaid` shortcuts were being removed; money movement should use Payments or the signed gateway path.
- Razorpay work was hardened toward signed webhook/verification and invoice/order binding.

### Invoice integrity

- Normal sale invoice finalization is intended to require a real linked Customer and a posted authoritative Challan.
- Purchase invoice finalization is intended to require a real linked Vendor.
- `vendorId`/customer linkage and legacy migration/backfill work is present.
- Direct legacy Order -> Invoice and Quotation -> Invoice bypasses were being retired.
- Tally import was being changed so it does not silently create already-finalized sale invoices that bypass Challan/customer/receivable rules.

### Procurement / GRN

- Purchase/GRN receipt work was being moved toward transactionality so PO received quantities, inventory, stock ledger and aggregate stock move together.
- Finished-goods purchases should create actual warehouse inventory entries, not just headline Product stock.
- Raw-material purchases should keep raw-material aggregate stock synchronized.

### Manufacturing

- Manufacturing Unit IDs and Warehouse IDs were previously mixed. The current pass added/uses a manufacturing-warehouse resolution layer.
- Raw-material availability/reservation/consumption should resolve the warehouse mapped to the manufacturing unit.
- Production planning was changed away from using the wrong finished-goods inventory model for raw materials.
- Approved/QC-aware raw-material availability is being enforced.

### MR sample inventory

- Current tree includes `server/services/mrSampleInventoryService.js` and `server/models/MrSampleOtp.js`.
- MR sample issue is intended to reduce warehouse/aggregate stock when moving stock to the MR bag.
- Doctor issue should then consume only the MR bag.
- The pass also added consistency checks to prevent warehouse stock and Product aggregate stock from silently drifting.

### Public/customer portal

- Website/customer portal is intended to be tenant-bound by `PUBLIC_FIRM_ID`.
- Public catalog exposure was being reduced to storefront-safe Product fields.
- Public sellable stock should count approved, positive, non-expired inventory only.
- Portal order/customer/invoice/tracking ownership was being moved to explicit customer IDs instead of unsafe name/phone matching.
- Website orders must remain Sales Orders only.
- Legacy anonymous phone-based tracking and unsigned storefront payment behavior were identified as unsafe and were being retired/hardened.

### Document numbering

- `Counter` / `documentCounter` were expanded toward firm-scoped atomic commercial numbering.
- Challan, quotation and several other auditable document generators were moved away from count/random/timestamp numbering.
- This still needs a final scan for any remaining non-atomic business-document number generators.

### Loaders / UI state

The user explicitly reported missing loaders on some pages.

Work already present includes:

- MR My Day initial loading/error states.
- Sales Workspace initial loading/error state plus mutation busy states.
- Sales Intelligence initial loading/error state and customer-switch loading isolation.
- Shared `WorkspacePrimitives` loading/error components.
- Shared API client changes intended to show delayed loaders for GET requests and immediate loaders for mutations.
- Dispatch/operational stock movement UI was being aligned with the authoritative Challan workflow.

Important philosophy for the remaining pass:

`Loading != Empty != Error`

Every major page should clearly distinguish those three states.

## Key files/services added during stabilization

New files currently visible in the tree include:

- `server/models/MrSampleOtp.js`
- `server/routes/public/queries.js`
- `server/services/dispatchService.js`
- `server/services/invoicePostingService.js`
- `server/services/manufacturingWarehouseService.js`
- `server/services/mrSampleInventoryService.js`
- `server/services/paymentPostingService.js`
- `server/services/salesOrderService.js`
- `server/services/salesPricingService.js`
- `server/services/salesReturnService.js`

These are important consolidation points. Prefer fixing/using shared services rather than reintroducing route-specific business logic.

## Original snapshot validation (superseded by the continuation results above)

The following checks were run on the exact working tree packaged here:

- Server JavaScript syntax audit: **319 JS files checked, 0 syntax errors**.
- `git diff --check`: **PASS**.
- `server/package.json`: parses successfully.
- `admin-crm/package.json`: parses successfully.
- Merge-conflict marker scan: **0 files**.

### Validation that was not completed in the original snapshot

There is no `node_modules` directory in this snapshot, so the following were **not** run successfully in this environment:

- Jest test suite
- backend lint with installed project dependencies
- full TypeScript typecheck
- Expo web production export
- full frontend runtime build
- MongoDB replica-set concurrency/integration test execution
- staging migration/index synchronization against a real production-like database

Do not claim those passed until they are actually run.

## Where the last audit stopped

The audit was interrupted while inspecting the general inventory router and any remaining legacy `sale` / `transfer` paths.

The immediate next check should begin with:

- `server/routes/inventory/inventories.js`
- `server/routes/inventory/stockMovements.js`
- `server/routes/sales/challans.js`
- `server/services/challanInventoryService.js`

Determine whether any remaining `sale`/`transfer` logic is merely historical/reporting compatibility or still performs physical stock movement outside the authoritative Challan service.

## Remaining required re-audit before production certification

Do not package a production-final build until all of these are completed.

1. **Direct stock mutation scan**
   - Find every write to `InventoryEntry`, `RawMaterialEntry`, `Product.stockLevel`, MR sample stock and stock ledger.
   - Confirm every physical sale/transfer path uses the intended authoritative service/document.
   - Confirm exceptional flows (damage, compliance writeoff, stocktake, samples, procurement, manufacturing) remain internally consistent.

2. **Legacy StockMovement scan**
   - Confirm there is no surviving normal Sale/Order StockMovement creation path.
   - Historical reads can remain, but sale/order StockMovement writes must not compete with `Challan`.

3. **Frontend API -> backend route connectivity**
   - Enumerate important `admin-crm/utils/api.ts` calls and raw fetches.
   - Confirm every endpoint is mounted, permission-compatible and returns the shape the page expects.
   - Especially recheck Orders, Sales Workspace, Sales Intelligence, Dispatch, MR My Day, Sale/Purchase Invoices and Customers.

4. **Route-order/shadowing scan**
   - Verify dynamic `/:id` routes cannot swallow static routes.
   - Recheck Orders public/internal mounts and MR routes.

5. **RBAC sweep**
   - Find authenticated state-changing routes without `authorize(...)` or equivalent policy enforcement.
   - Compare every permission string with the central permission catalog.
   - Verify firm-scoped custom-role behavior.

6. **Realtime tenancy**
   - Confirm no business event still uses global `io.emit` when it should use a firm room.
   - Confirm portal/customer tokens cannot subscribe to staff events.

7. **Webhook security**
   - Razorpay signature and invoice/order binding.
   - Courier webhook signature/secret handling.
   - Ensure retired unsigned storefront payment hooks are unreachable.

8. **Returns/accounting**
   - Recheck posted Sales Return reversal end-to-end.
   - Confirm stock bucket, stock ledger, Product aggregate, Customer balance and Credit Note all reverse together.
   - Confirm free/promotional return quantities do not generate credit value.

9. **Procurement/GRN**
   - Recheck PO -> GRN -> inventory -> vendor/purchase-document path for transactionality.
   - Confirm repeated item lines produce unique movement keys.

10. **Invoice status normalization**
    - Confirm no operational code still writes/queries legacy `partial` where canonical status is `partially_paid`.

11. **Migration/index audit**
    - Recheck `server/scripts/migrate-production.js` for:
      - firm backfills
      - customer/vendor link backfills
      - QC defaults
      - role-permission tenancy
      - raw-material warehouse identity
      - duplicate preflight before unique-index sync
      - legacy `partial` normalization
    - Test migration against a copy of real/staging data before production.

12. **Document-number scan**
    - Search for `countDocuments()+1`, “last document + 1”, random numeric IDs, and timestamp-derived auditable document numbers.
    - Move remaining commercial/auditable documents to `documentCounter` where appropriate.

13. **Loader/error-state sweep**
    - Initial load
    - section load
    - refresh
    - mutation submit/busy
    - empty state
    - retryable error state
    - Ensure no screen displays zero business metrics while its first requests are still in flight.

14. **Frontend navigation audit**
    - Confirm Sidebar/Dashboard links target the authoritative Sales/Challan/Dispatch pages.
    - Remove stale labels referring to retired Delivery Challan / StockMovement behavior.

15. **Tests to add/run**
    At minimum cover:
    - tenant isolation for reads and single-document writes
    - firm-scoped RBAC
    - concurrent Challan posting
    - cancelled/overfulfilled Sales Order Challan prevention
    - freeQty/billableQty invoice totals
    - Sales Return posting + reversal
    - split payment customer balance
    - payment allocation party ownership
    - portal tenant/customer ownership
    - dispatch partial/multi-Challan status
    - production manufacturing-unit warehouse resolution
    - MR Warehouse -> Bag -> Doctor inventory chain
    - public query management remains private
    - webhook signature failures

## Production gate to run after the re-audit

Backend:

```bash
cd server
npm ci
npm run lint
npm test -- --runInBand
npm audit --omit=dev
```

Frontend:

```bash
cd admin-crm
npm ci
npx tsc --noEmit
npx expo export --platform web
npm audit
```

Then on staging:

- run production migration against a database copy;
- inspect index synchronization output;
- run inventory reconciliation;
- run a two-firm tenant-isolation smoke test;
- test concurrent Challan finalization on a transaction-capable MongoDB replica set;
- test backup **and actual restore**;
- verify `/api/health` and `/api/ready` on Render;
- verify exact `ALLOWED_ORIGINS`, strong `JWT_SECRET`, `PUBLIC_FIRM_ID`, `ENFORCE_TENANCY=true` and payment/courier/WhatsApp secrets;
- perform role-based end-to-end browser smoke tests.

## Suggested first prompt for the new chat

> Continue the CRM stabilization from `HANDOFF_FOR_NEW_CHAT.md` in this ZIP. Do not restart from an older build. First inspect the current diff and finish the remaining re-audit beginning with `server/routes/inventory/inventories.js` for surviving direct sale/transfer stock movement paths. Then complete the RBAC, route/API connectivity, loader/error-state, migration/index and regression-test sweeps. Fix every confirmed issue, re-run the full static/runtime gates available, and only then produce a production-candidate ZIP. Preserve the rule that Sale Challan is the truth document for physical sale/transfer stock movement.

## Important honesty requirement

This snapshot contains a large amount of stabilization work and currently passes server syntax checks, but it is **not yet production-certified** because the full dependency-backed test/build/staging gates have not been completed and the final semantic re-audit was interrupted.
