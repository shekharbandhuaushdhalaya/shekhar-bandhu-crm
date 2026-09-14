# Shekhar Bandhu CRM — Manufacturing / AYUSH Hardening Update

## Implemented
- Product-specific AYUSH QC specification model with version, source, approval and test definitions.
- CoA generation is now specification-driven; missing mandatory tests no longer default to PASS.
- CoA approval is blocked until required tests are PASS.
- BMR raw-material entries now support analytical report number and received/approved/issued/used/returned/rejected quantities.
- BMR manufacturing stages now support SOP reference, process parameters and equipment calibration metadata.
- Two-person authenticated Chemist + QA electronic signature workflow. Same-user dual signing is blocked.
- Market-release gate now requires BMR approval, completed critical stages, dual signatures, approved product-specific QC specification, mandatory QC passes, and manufacturing/filling/packing line clearances.
- Line clearance now supports three phases: manufacturing, filling and packing.
- Existing equipment, deviations/CAPA, stability, recall and vendor qualification modules are surfaced in a new GMP & AYUSH Compliance dashboard.
- Production social publishing no longer reports mocked success when a live integration is unavailable.
- Production sample OTP flow fails closed unless a real provider is configured; development mock OTP is explicitly opt-in.
- Added migration script for legacy LineClearance unique index.
- Added focused AYUSH hardening tests.

## Validation
- Node syntax checks passed for all modified server JavaScript files.
- Full Jest execution could not be completed in this environment because the repository's Jest binary/dependencies are not currently installed/available (`jest: not found`). Run `npm ci` in `server/` and then `npm test -- --runInBand` in a normal development/CI environment.

## Regulatory basis
The BMR/QC changes are designed around the Ministry of AYUSH Gazette requirements for BMR records, including raw-material received/issued/used quantities, analytical report and batch numbers, process records, cleaning/calibration records, personnel signatures, line clearance before manufacturing/filling/packing, packaging reconciliation, theoretical/actual yield, and QC release after checking completed BMRs. Product specifications remain product-/monograph-specific rather than using universal hard-coded limits.

This software update supports compliance workflows; it does not by itself certify a manufacturing site, product, laboratory, licence, or finished batch as legally compliant.

## Additional production hardening
- Production startup no longer auto-seeds demo/default users or starts before MongoDB is connected.
- Production config rejects short JWT secrets, missing origins and wildcard origins.
- Tenant middleware now rejects explicit cross-firm query attempts rather than only adding a tenant filter when absent.
- Production database migration requires an explicit confirmation flag.
- HTTP database restore was disabled; controlled `mongodump`/`mongorestore` scripts were added instead.
- Password creation/change validation now requires 12+ characters.
- WebSocket query-string token authentication was removed.

- Added GitHub Actions production gates for backend tests/lint and frontend web build.
- Restricted authenticated system settings to `settings:view` and removed bank account/IFSC/UPI details from the unauthenticated public settings response.
