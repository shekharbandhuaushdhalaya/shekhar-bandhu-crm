# Production-readiness roadmap

**Branch:** `work/production-readiness-phase-7`  
**Tracking PR:** #10 (keep open; do not merge without explicit approval)  
**Baseline commit:** `44ed2bd373d28f08c15428ecbffa286ec36f6f5f`

## Purpose and completion rules

This roadmap is the acceptance register for the approved production-readiness backlog. Existing models, routes, and screens are treated as foundations—not as completed workflows—until the user journey, authorization, persistence, audit trail, failure handling, and automated tests are verified together.

A backlog item is complete only when:
1. The data model and migration/index implications are reviewed.
2. Server-side validation, tenant scoping, permissions, and maker-checker controls are enforced.
3. State transitions are explicit and immutable evidence is retained where required.
4. The user-facing workflow is usable on web and mobile layouts where applicable.
5. Automated positive, negative, authorization, concurrency/idempotency, and regression tests pass.
6. Operational documentation and deployment/configuration requirements are recorded.

A passing CI run validates the checks it executes; it does not certify statutory compliance or production readiness.

## Delivery sequence

| Phase | Scope | Priority | Exit criteria |
|---|---|---:|---|
| 0. Foundation and safety | Tenant isolation, RBAC, audit events, idempotency, transactions, indexes, backups, monitoring, CI/CD, error handling | P0 | Security and data-integrity review passes; restore and deployment procedures tested |
| 1. Procurement and incoming stores | Requisitions, vendor/material qualification, quote comparison, PO approval, price history, supplier scorecards, budgets; gate entry, weighment, GRN, CoA review, quarantine, supplier returns, QR/barcode, bins/racks | P0 | Full PO-to-GRN-to-QC-to-return trace is tested without duplicate stock/accounting postings |
| 2. QA/QC and GMP records | Product-specific raw-material and finished-product specs, sampling plans, results, independent review, CoA controls, deviations/CAPA, stability, retention samples, SOP revisions, internal audits | P0 | Batch release is blocked until all configured tests, evidence, signatures, and independent QA release are complete |
| 3. Manufacturing execution | Controlled BOM/formula revisions, production order approval, reservations, dispensing/weighing, line clearance, stage-wise BMR, calibration, competency, yield/wastage, genealogy, cost and efficiency | P0 | Complete reproducible BMR and reconciliation from issued material through finished batch |
| 4. Finished goods | QA release, batch/warehouse/bin stock, FEFO, reservations, barcode movements, cycle counts, expiry and slow-moving alerts | P0 | Only released, unexpired and available batches can be allocated or dispatched |
| 5. Sales and order-to-cash operations | Segmentation, distributor onboarding, territories, catalogue, schemes, targets, credit, forecasting; customer PO, approval, ATP, batch allocation, partial fulfilment, backorders, invoice/challan/dispatch reconciliation, returns and credit notes | P1 | Order lifecycle reconciles commercial documents to physical batch movements and customer balances |
| 6. Dispatch, service and recall | Pick/pack verification, packing labels, transporter, verified e-way bill integration, tracking, POD, RTO, freight reconciliation; complaints, investigation, returns quarantine, recall execution and effectiveness | P1 | Batch genealogy can identify affected stock/customers and demonstrate recall effectiveness |
| 7. Finance, HR and management | AP/AR ageing, bank reconciliation, payment maker-checker, profitability, GST reconciliation, accounting integration, cashflow; onboarding, attendance, training, asset maintenance; dashboards, KPIs, audit, DR, monitoring and analytics | P1/P2 | Reconciled financial reporting, trained users, management visibility and tested recovery |
| 8. Release hardening | Performance, accessibility, security testing, dependency review, migration rehearsal, backup restore, runbooks, alerts, statutory document review, UAT | P0 gate | Named business owners sign UAT; release checklist and rollback plan approved |

## Functional backlog register

### Procurement (PR)
- PR-01 purchase requisitions and approvals
- PR-02 supplier qualification by material
- PR-03 quotation comparison and selection evidence
- PR-04 purchase-order maker-checker approval
- PR-05 supplier/material price history
- PR-06 supplier performance and rejection scorecards
- PR-07 procurement budget controls

### Stores and incoming material (ST)
- ST-01 PO-linked GRN and receipt reconciliation
- ST-02 gate entry, vehicle and weighment evidence
- ST-03 incoming inspection and QC disposition
- ST-04 supplier CoA reference, document review and traceability
- ST-05 quarantine and controlled release
- ST-06 supplier rejection, return, replacement and debit-note evidence
- ST-07 barcode/QR identity and scanning workflows
- ST-08 warehouse/bin/rack location control

### QA/QC (QA)
- QA-01 material-specific test plans/specifications
- QA-02 incoming sampling, actual test results and independent approval
- QA-03 in-process QC checks
- QA-04 finished-product testing
- QA-05 independent QA release
- QA-06 controlled, batch-linked CoA
- QA-07 deviation and CAPA lifecycle
- QA-08 stability studies
- QA-09 retention samples
- QA-10 controlled SOP/document revisions
- QA-11 internal audits and findings

### Manufacturing (MF)
- MF-01 controlled BOM/formula revisions
- MF-02 production-order approval
- MF-03 material reservation
- MF-04 dispensing and weighing
- MF-05 line clearance
- MF-06 stage-wise BMR
- MF-07 equipment calibration
- MF-08 operator qualification and training
- MF-09 yield and wastage reconciliation
- MF-10 batch genealogy
- MF-11 production costing
- MF-12 manufacturing efficiency

### Finished goods (FG)
- FG-01 QA release gate
- FG-02 batch-level stock tracking
- FG-03 FEFO allocation
- FG-04 bin/rack locations
- FG-05 stock reservation
- FG-06 barcode-controlled movements
- FG-07 cycle counts and variance approvals
- FG-08 expiry and slow-moving alerts

### Sales and order processing (SM/OP)
- SM-01 customer segmentation
- SM-02 distributor onboarding
- SM-03 sales territories
- SM-04 controlled product catalogue
- SM-05 schemes and discounts
- SM-06 sales targets
- SM-07 customer credit controls
- SM-08 demand forecasting
- OP-01 customer PO capture
- OP-02 order approval
- OP-03 available-to-promise checks
- OP-04 batch allocation
- OP-05 partial fulfilment and backorders
- OP-06 order/invoice/challan/dispatch reconciliation
- OP-07 returns and credit notes

### Dispatch, customer service and recall (DL/CS)
- DL-01 pick lists
- DL-02 packing verification
- DL-03 packing lists and labels
- DL-04 transporter assignment
- DL-05 official e-way bill integration and portal response verification
- DL-06 shipment tracking
- DL-07 proof of delivery
- DL-08 failed delivery and RTO
- DL-09 freight reconciliation
- CS-01 complaint intake
- CS-02 complaint investigation
- CS-03 return authorization
- CS-04 returned-goods quarantine
- CS-05 batch recall
- CS-06 recall effectiveness and recovery evidence
- CS-07 customer feedback

### Finance (FN)
- FN-01 invoice matching
- FN-02 accounts-payable ageing
- FN-03 accounts-receivable ageing
- FN-04 bank reconciliation
- FN-05 payment maker-checker
- FN-06 product profitability
- FN-07 GST reconciliation
- FN-08 Tally/accounting integration
- FN-09 cashflow reporting

### HR, management and IT (HR/MG)
- HR-01 employee onboarding
- HR-02 attendance and leave
- HR-03 training and competency
- HR-04 role-based access review
- HR-05 asset maintenance
- MG-01 management dashboard
- MG-02 KPI definitions and ownership
- MG-03 audit trail coverage
- MG-04 backup and disaster recovery
- MG-05 monitoring and alerting
- MG-06 security hardening
- MG-07 mobile access and offline-safe behavior
- MG-08 governed AI analytics

## Regulatory and document-control guardrails

For AYUSH manufacturing, workflows and records must be configured against the applicable Drugs and Cosmetics Act/Rules, Schedule T GMP, product licence conditions, and applicable pharmacopoeial or approved in-house specifications. Requirements are product- and licence-specific; do not apply one generic test panel to every formulation.

System-generated BMRs, test records, CoAs, registers and reports must retain batch linkage, approved master/formula revision, document numbering, timestamps, user identities, review/release evidence and revision history. A CoA is not an authorised certificate until actual verified results and an authorised signatory/release are present. Government forms, licences, laboratory certificates and portal submissions must never be fabricated or represented as officially filed without verified external evidence.

Supplier debit-note references are evidence only; they do not post accounting adjustments. Rejected receipt quantities already excluded from accepted stock must never be deducted a second time.

## Current verified checkpoint

- Purchase requisition, quotation, PO/GRN, inventory ledger, stocktake, dispatch, batch genealogy, QC specification/quarantine, deviation/CAPA, stability, retention-sample and recall foundations exist in the repository.
- Supplier-return backend lifecycle exists (request, independent approval/rejection, dispatch, resolution). This delivery completes the corresponding GRN-screen actions and adds visible evidence for each state.
- Incoming QC inspection now pins the approved material specification/version and requires every mandatory test; its regression fixture correction is included in this delivery.
- Manufacturing line-clearance now has separate submit and independent verify steps; production cannot self-clear a line, and verified records cannot be overwritten.
- BMR presentation removes default licence identifiers, shelf-life values, generic QC limits and placeholder signatories; recorded test results are shown with their actual statuses, and missing data is not presented as a pass.
- Filling and packing stage starts now require their own complete, independently verified line-clearance records; BMR completeness also reports missing clearances for each production phase.
- Market release now reconciles each non-packaging ingredient against the pinned formula quantity and requires stock-lot-linked consumption backed by independently verified dispensing records; missing, short, unverified or unexplained-wastage evidence blocks release.
- Batch completion now applies the same critical-stage evidence standard before warehouse processing: independent performer/verifier identities, verified Chemist/QA signatures, current training evidence, valid equipment calibration, and documented reasons for skipped stages. Rejected completion attempts stop before warehouse lookup or packaging reconciliation.
- The batch-completion endpoint now accepts only a pending QC disposition. Legacy completion fields cannot approve or reject a batch; finished-product test results can be recorded only after completion against the pinned approved product specification. Failed results place the batch on QC hold, while passing mandatory results require independent QA review.
- The manufacturing completion UI no longer offers a QC pass/fail decision or pre-populated laboratory passes during completion. It records production output and transfer data only; finished-product QC testing, independent QA disposition and market release are separate post-completion steps. The QC Testing stage may remain pending at manufacturing completion and is not auto-completed or overwritten.
- Manufacturing completion now requires a finite positive total yield, exact reconciliation between size-wise yields and the declared batch yield, and a documented reason for any non-zero recorded wastage.
- Retrying a committed manufacturing completion now returns its already-created production-transfer Challan instead of falsely reporting completion failure. Missing formula dispensing evidence is rejected before finished-goods processing; completion no longer backfills raw-material consumption by directly deducting stock.
- Material dispensing records now persist weighed wastage quantities and documented reasons, with model-level validation against unexplained or excessive wastage; replica-set persistence coverage verifies the stored GMP evidence.
- A MongoDB replica-set integration test now exercises the full material issue journey: reserved lot, pending dispensing, independent verification, raw-material balance/ledger update, stage loss and batch genealogy persistence.
- Market release now reconciles each consumed stock-lot/stage line against its independently verified dispensing record, including exact weighed quantity and wastage/reason; repeat issues from the same lot remain separate traceable consumption lines.
- Finished-goods completion now compares the transaction's fresh batch timestamp with the snapshot that passed pre-completion evidence checks; stale concurrent edits return HTTP 409 and cannot post a receipt or transfer Challan.
- Market release now uses the same BMR completeness rules for current stored retention samples and self-packed packaging reconciliation: each formula packaging material must have independently verified, non-discrepant quantity accounting tied back to verified dispensing.
- Finished goods received from manufacturing remain explicitly market-blocked until the independent batch QA release is recorded; the release and stock eligibility update commit together. Production-transfer posting validates the source batch and release state, and sales allocation rejects unreleased in-house lots.
- Sales FEFO allocation now orders dated expiries ahead of lots with unknown expiry dates, retains exact inventory-entry references on Challans and Dispatches, and keeps stock posting transactional and idempotent.
- The above foundations are not a blanket completion claim for the functional IDs. Remaining phases require end-to-end UAT and evidence-based closure.

### Next verification batch
- Exercise the manufacturing completion UI through the post-completion QC analyst and independent QA reviewer journey on web and mobile.
- Add failure-injection coverage for production-house warehouse creation; receipt/Challan rollback and idempotent service retry are now covered by MongoDB replica-set integration tests.
- Complete an end-to-end material genealogy rehearsal from reserved raw-material lots through independently verified dispensing, finished-goods receipt, QC release and production-transfer posting.
