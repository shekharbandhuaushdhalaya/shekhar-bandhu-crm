# Changes made on top of crm-stabilization-continuation-2026-09-12

This file documents everything changed after comparing this zip
(`crm-stabilization-continuation-2026-09-12`) against the original
`shekhar-bandhu-crm-main` zip, running the real Jest suite for both, and
tracing every non-infrastructure test failure to its root cause.

## Summary

Before these changes: 35/64 suites, 167/238 tests passing in this sandbox
(vs. 45/64 suites, 184/238 for the original `main` zip — a real, if
narrow, regression).

After these changes: **45/64 suites, 184/238 tests passing — back to full
parity with `main`**, while keeping every genuine improvement this
stabilization pass made (atomic tenant-scoped document numbers, real
Mongoose transactions for sample issuance, Challan-based stock-transfer
shipping and order tracking, fail-closed public tenant resolution, the
retired legacy public-order endpoint, etc.).

The 19 still-failing suites in this sandbox are **all** blocked by the same
external cause: `mongodb-memory-server` cannot download a MongoDB binary
here (`fastdl.mongodb.org` returns 403 for this sandbox's network policy).
This affects `main` identically — it is not something introduced by this
codebase, and it is already flagged in this repo's own
`RELEASE_VALIDATION_2026-09-12.md`. It will resolve in any environment
with normal internet access or a cached Mongo binary.

## Root cause found and fixed (test debt, not app bugs)

Ten test files failed or hung because production code was correctly
upgraded (atomic tenant-scoped counters, real Mongoose transactions,
multi-tenant background scanners, Challan-based dispatch/shipping) but the
corresponding Jest unit tests still mocked only the *old* models/helpers.
With the new code path calling an unmocked Mongoose model or
`mongoose.startSession()`, the tests hit a real (non-existent) database
connection and either threw or hung until timeout. No production code
change was required for any of these — only test mocks/assertions:

- `__tests__/ayushGmpCompliance.test.js` — mock `Counter`
- `__tests__/quarantineQcEnforcement.test.js` — mock `Counter`
- `__tests__/materialRequirementsPlan.test.js` — mock `Counter`
- `__tests__/manufacturingAdvancedSuite.test.js` — mock `Counter`
- `__tests__/tasksAssignment.test.js` — mock `Firm` (overdue-task scan is
  now per-tenant, iterating `Firm.find()`)
- `__tests__/complianceAndOperations.test.js` — mock `Counter`, `Challan`,
  `challanInventoryService`, `withTransaction`; updated the stock-transfer
  number assertion (now 5-digit padded, `TRSF-00001` not `TRSF-0001`);
  rewrote the transfer-ship test for the new Challan-based shipping flow;
  fixed the `MrVisit.create` mock to resolve an array, matching the
  session-based `create([data], {session})` call form
- `__tests__/portalAndRecallFeatures.test.js` — mock `Challan`; rewrote the
  order-tracking tests for the new Challan→Dispatch lookup; the
  cross-customer case now correctly expects `404` (not `403`) since the
  scope check moved into the `Order.findOne({_id, customerId})` query
  itself — an improvement, since it no longer confirms the order's
  existence to a caller who doesn't own it
- `__tests__/doctorIntegrations.test.js` — swapped `MrSampleStock` mocks
  for `MrSampleBag` (the canonical model), mocked `Firm` and
  `withTransaction`, mocked `mrSampleInventoryService`, and fixed the
  `sendDoctorGreetings()` assertion to match its new per-tenant array
  return shape
- `__tests__/sampleRoiAndDoctorTourPlans.test.js` — same `MrSampleBag` /
  `withTransaction` pattern, plus a rewrite of the issue-to-doctor test
  (see below)
- `__tests__/connectedComponentsSuite.test.js` — the one case here was
  *not* test debt: it tested `POST /api/orders/public/create`, which this
  codebase intentionally retired (`410 Gone`) as a security hardening
  measure (unauthenticated order creation with commission calculation was
  a real attack surface). Updated the test to assert the retirement
  instead of the old behavior.

## Two genuine feature regressions found in the app code, restored

These were not test-mock problems — the stabilization refactor of
`routes/crm/medicalReps.js` silently dropped working functionality.

1. **`GET /api/medical-reps/:id/sample-roi`** — an MR-level aggregate
   Sample ROI rollup across all doctors assigned to that MR — existed in
   `main` and was completely removed with no replacement. (`/roi-dashboard`
   remains, but it computes a different metric via
   `calculateMRProfitability`, not a substitute.) Restored the route
   verbatim from `main` into `routes/crm/medicalReps.js`.

2. **The `SampleConversion` "pending" record write** inside
   `POST /medical-reps/sample-stock/issue-to-doctor` /
   `POST /issue-to-doctor` was dropped when that endpoint was rewritten to
   use a real transaction — it now only wrote `MrSampleIssuance`. This
   silently starved the Doctor/MR Sample ROI reports (including the route
   restored above, and the existing `GET /api/doctors/:id/sample-roi`)
   of their data source. Re-added the `SampleConversion.create(...)` write
   inside the same transaction/session as the `MrSampleIssuance` write.

**Recommendation:** both of these look like accidental losses during a
large refactor rather than intentional decisions — worth a quick sanity
check with whoever owns the MR/Doctor ROI reporting feature, but the
restored code matches `main`'s original behavior exactly.

## What was *not* changed

- No other business logic was touched. Every other diff between this zip
  and `main` (atomic counters, transactional writes, Challan-based
  shipping/tracking, fail-closed public tenant resolution, the retired
  legacy order endpoint, dependency/`npm audit` fixes, ESLint config) is
  exactly as it was in the zip you provided — those were correct
  improvements and are preserved as-is.
- The 19 MongoDB-download-blocked suites listed above were left alone;
  they need a real MongoDB (or a working `mongodb-memory-server` binary
  cache) to run, in any environment.
