# Project Improvement Roadmap

This roadmap is the implementation backlog for Shekhar Bandhu CRM. Work is delivered incrementally, with each phase reviewed and tested before moving on. Existing features are not assumed to be broken merely because they appear in this list; each item must be audited before changing it.

## Delivery rules
- Work only on `project/complete-improvement-roadmap` until explicitly directed otherwise.
- Do not merge to `main` without explicit approval.
- Preserve existing business rules, permissions, data contracts, and responsive behavior.
- Prefer shared components and services over duplicated implementations.
- For each change: inspect current behavior, implement a focused change, test affected workflows, run available checks, and document any validation gaps.
- Treat security, accounting, inventory, batch traceability, and compliance controls as high-risk areas requiring regression tests.

## Phase 1 — Stability and defect baseline
- [ ] Run frontend TypeScript check and production web build; record and fix failures.
- [ ] Run backend Jest suite and lint; record and fix failures.
- [ ] Audit browser and server errors, loading/error/empty states, and API failure handling.
- [ ] Verify CRUD, search, filters, pagination, sorting, duplicate-submit protection, and destructive-action confirmation.
- [ ] Audit validation, referential integrity, idempotency, and data consistency for critical workflows.
- [ ] Add regression tests for confirmed defects.

## Phase 2 — UI/UX design system
- [ ] Audit every route against shared page, header, toolbar, table, form, dialog, status, loading, and empty-state components.
- [ ] Standardize spacing, typography, color tokens, surfaces, controls, badges, and modal/drawer behavior.
- [ ] Improve responsive behavior for laptop, tablet, and mobile widths.
- [ ] Remove duplicated UI patterns and consolidate shared components without changing business logic.
- [ ] Ensure accessible labels, focus states, keyboard operation, and readable contrast.

## Phase 3 — Dashboard and navigation
- [ ] Review dashboard metrics for correctness against source records and reports.
- [ ] Improve date filters, revenue/sales/collections, receivables, stock/expiry, production/QC, dispatch, product and team summaries.
- [ ] Add useful drill-downs and role-appropriate quick actions.
- [ ] Review sidebar grouping, global search, active states, recent pages, and role-aware navigation.

## Phase 4 — Product, inventory, manufacturing, and compliance
- [ ] Products: simplify product forms, ingredient selection, units, recipes/BOM, variants, SKU/barcode, documents, and product history.
- [ ] Inventory: clarify available/reserved/quarantined stock, warehouse/batch views, stock ledger, transfers, stocktakes, reconciliation, reorder and expiry alerts.
- [ ] Manufacturing: improve planning, material allocation, actual-vs-planned consumption, batch progress, yield/wastage, BMR, traceability, and costing.
- [ ] QA/QC: verify specification-driven checks, dual approvals/signatures, CoA generation, and release gates.
- [ ] GMP/AYUSH: improve equipment calibration, deviations/CAPA, vendor qualification, stability, recall, retention samples, audits, and pharmacopoeia validation.
- [ ] Add regression coverage for stock, batch, and compliance invariants.

## Phase 5 — Sales and CRM
- [ ] Customers/vendors: improve profiles, activity timeline, ledger, credit terms/limits, pricing, and transaction history.
- [ ] Sales: improve quotation-to-order, fulfilment, challan, invoicing, returns, credit/debit notes, discounts, schemes, and document sharing.
- [ ] CRM: improve lead assignment, pipeline, follow-ups, activity logging, tasks, reminders, and conversion.
- [ ] Doctors/MRs: improve territory/visit planning, daily logs, sample bag and OTP issuance, returns/conversions, expenses, targets, and incentives.

## Phase 6 — Finance and reporting
- [ ] Improve payment capture/allocation, receivables ageing, customer/vendor ledgers, bank reconciliation, expenses, and recurring invoices.
- [ ] Verify GST, TDS/TCS, e-way bill, and accounting exports against applicable business rules.
- [ ] Standardize report filters, drill-downs, exports, print layouts, and scheduled delivery.
- [ ] Reconcile report totals with source invoices, payments, and stock ledgers.

## Phase 7 — Automation, integrations, and intelligence
- [ ] Review low-stock, expiry, overdue-payment, lead-follow-up, approval, and production notifications.
- [ ] Review WhatsApp, email, payment gateway, Tally, customer portal, courier, and public API integrations.
- [ ] Improve AI insights and forecasts with source attribution, sensible confidence indicators, and human approval for consequential actions.
- [ ] Add monitoring and actionable failure reporting for background jobs and integrations.

## Phase 8 — Security, performance, and maintainability
- [ ] Audit backend authorization, firm/tenant isolation, sessions, MFA, sensitive data, uploads, rate limits, and audit coverage.
- [ ] Review backups, restore drills, migrations, deployment preflight, and rollback procedures.
- [ ] Optimize slow APIs, database indexes, large lists, dashboard loading, images, bundle size, and socket usage.
- [ ] Consolidate API utilities, validation, error handling, and duplicated business logic.
- [ ] Expand frontend, backend integration, and end-to-end coverage for critical user journeys.
- [ ] Document APIs, operational procedures, and release checks.

## Suggested execution order
1. Stability baseline and confirmed defects.
2. Shared UI system and responsive page audit.
3. Dashboard and navigation.
4. Products and inventory.
5. Manufacturing and compliance.
6. Sales and CRM.
7. Finance and reporting.
8. Automation and integrations.
9. Security, performance, and release hardening.

## Completion criteria
A task is complete only when its behavior is implemented, permissions and responsive states are checked, relevant automated tests pass (or a test gap is documented), and no unrelated business behavior is regressed.
