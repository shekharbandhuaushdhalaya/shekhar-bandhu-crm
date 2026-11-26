# Production readiness: UAT and manufacturing rehearsal

This checklist is an execution record template, not evidence that a live UAT or physical manufacturing run has occurred. Mark each item PASS only after capturing the named evidence in the deployed target environment.

## 1. Finance and tenant-isolation verification
- [ ] Run `npm run migrate:idempotency-index` once against the production database during a controlled maintenance window; confirm the old global unique index is gone and the tenant-scoped index exists.
- [ ] Run `npm run verify:indexes`; archive output.
- [ ] In two test firms, submit the same idempotency key and same route with distinct payloads. Confirm independent records and responses.
- [ ] In one firm, replay the same key and payload; confirm the original response is returned without a second ledger mutation.
- [ ] Reuse the same key with a different payload; confirm HTTP 409 `IDEMPOTENCY_KEY_CONFLICT`.
- [ ] Race two identical requests; confirm only one mutation commits and the other receives replay/in-progress response.
- [ ] Verify payment allocation, payment reversal, sales-return posting and reversal against invoice, party balance, stock ledger and audit trail.

## 2. Sales, returns and recall
- [ ] Create a return only against an original posted sale Challan; verify item, batch and quantity limits.
- [ ] Attempt cumulative over-return from two concurrent drafts; one must fail without stock or credit-note duplication.
- [ ] Post returned stock; verify it enters `under_test` with `marketReleased=false`.
- [ ] Verify only an independent QA reviewer can disposition returned stock; rejected stock remains unavailable to sale/dispatch.
- [ ] Verify return reversal maker-checker controls and linked credit-note/payment reconciliation.
- [ ] Initiate a recall for a test batch; reconcile every finalized sale invoice and customer line.
- [ ] Record customer notifications with method and evidence reference; test duplicate notification and concurrent status updates.
- [ ] Complete/close recall only after every affected invoice is notified, full distributed quantity is reconciled and independent reviewer supplies substantive closure notes.

## 3. Browser and mobile UAT
- [ ] Test current supported desktop browser: login/MFA, tenant switching, role permissions, payment creation/allocation/reversal, sales return create/post/QC/reverse, recall notifications/status, batch trace and CAPA closure.
- [ ] Test supported Android and iOS builds on real devices: same critical flows, attachment/photo upload, offline/network interruption and retry behavior.
- [ ] Capture app/build version, device/OS/browser, firm and role, test data IDs, request IDs, screenshots, expected/actual result and tester sign-off.
- [ ] Confirm no UI shows a successful action before the server confirms it; refresh and verify persisted balances/status after every mutation.

## 4. End-to-end manufacturing rehearsal
- [ ] Use a controlled non-saleable test batch and approved, traceable raw-material lots.
- [ ] Verify supplier/GRN identity, material QC release, expiry, warehouse and lot linkage before dispensing.
- [ ] Dispense reserved quantities; reconcile raw-material ledger before/after and retain batch/lot genealogy.
- [ ] Record stage operators, independent verifiers, SOP/equipment calibration evidence, process parameters, yield and losses.
- [ ] Record mandatory finished-product QC results against the pinned approved specification; have a different QA approver review.
- [ ] Complete BMR/line clearance, packaging reconciliation, retention sample, deviation/CAPA closure and independent batch release.
- [ ] Verify released finished-goods inventory is market-released; trace backward to every raw-material lot and forward to test dispatch/customer records.
- [ ] Simulate a recall on the test batch and reconcile distributed, notified and recovered quantities.

## 5. Final production sign-off
- [ ] CI green on the exact release SHA; record backend tests/lint and frontend typecheck/build.
- [ ] Production preflight and index verification pass; backups and restore drill evidence attached.
- [ ] No unresolved critical/high security, tenant-isolation, financial-integrity, QC or genealogy findings.
- [ ] UAT and manufacturing rehearsal evidence reviewed by Finance, QA, Operations and Engineering owners.
- [ ] Release owner approves deployment, rollback plan, monitoring and incident contacts.
