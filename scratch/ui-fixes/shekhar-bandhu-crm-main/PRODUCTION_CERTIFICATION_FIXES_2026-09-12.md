# Production Certification Fixes — 2026-09-12

This pass addresses the release blockers identified during the production-readiness audit.

## Fixed

1. **Exact production CORS**
   - Production no longer implicitly accepts arbitrary `*.vercel.app`, `*.onrender.com`, or localhost origins.
   - `ALLOWED_ORIGINS` must be provided and contains exact HTTPS origins only.
   - Development/test convenience behavior remains unchanged.

2. **Fail-closed public tenant binding**
   - `PUBLIC_FIRM_ID` is required in production and validated as a MongoDB ObjectId.
   - Public storefront/portal middleware returns `503` instead of selecting the first active firm if the production binding is missing.
   - This prevents future cross-tenant data exposure when multiple firms exist.

3. **Real CI production gate**
   - Added `.github/workflows/production-gate.yml`.
   - Backend gate: clean install, lint, Jest, production dependency audit.
   - CRM gate: clean install, TypeScript check, Expo web export, production dependency audit.
   - Added `server:test:ci` and `admin-crm:typecheck` scripts.

4. **Regression tests**
   - Added production configuration tests covering exact CORS and required public tenant binding.
   - Added a fail-closed middleware test for missing `PUBLIC_FIRM_ID` in production.
   - Added a tenant-isolation regression test covering scoped reads and rejected cross-tenant writes.
   - Added a transaction-backed concurrent Challan posting test proving the same Challan moves stock only once.

5. **Deployment configuration consistency**
   - Added `PUBLIC_FIRM_ID` to `render.yaml` as a managed secret.
   - Corrected the root frontend example variable to `EXPO_PUBLIC_API_URL`, matching the CRM application and Docker build.

## Deployment requirements

Set these Render variables before a production deployment:

- `NODE_ENV=production`
- `MONGODB_URI=...`
- `JWT_SECRET=<random secret of at least 32 characters>`
- `ALLOWED_ORIGINS=https://<crm-domain>,https://<website-domain>`
- `PUBLIC_FIRM_ID=<24-character MongoDB ObjectId for the website's firm>`
- `ENFORCE_TENANCY=true`
- `TRUST_PROXY=true` when deployed behind Render's proxy

The CI gate should pass on the release commit before deploying to Render. Staging database migration/index verification, inventory reconciliation, concurrency smoke tests, and a backup/restore drill remain operational release procedures rather than source-code defects.
