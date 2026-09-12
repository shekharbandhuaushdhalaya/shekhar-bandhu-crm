# Release Validation — 2026-09-12

## Passed in this packaging environment

- Full backend JavaScript syntax audit.
- Production configuration positive/negative smoke checks.
- Exact-match production CORS behavior.
- Required `PUBLIC_FIRM_ID` and `ALLOWED_ORIGINS` startup validation.
- GitHub Actions workflow YAML parse.
- `package.json` / `package-lock.json` JSON integrity.
- Render manifest contains `PUBLIC_FIRM_ID`.
- Root frontend API environment variable matches the actual CRM variable (`EXPO_PUBLIC_API_URL`).
- Production regression test files are present for CORS/config, public tenant fail-closed behavior, tenant isolation, and concurrent Challan posting.

## Must pass in CI/staging before live data

A clean `npm ci` attempt in the packaging sandbox timed out before dependencies were fully installed, so Jest/lint/Expo export are intentionally not marked as passed here. The included `.github/workflows/production-gate.yml` now enforces those checks on the release commit.

Staging operational gates remain mandatory: production migration/index verification, inventory reconciliation, simultaneous-posting smoke test against the staging MongoDB replica set, and backup/restore drill.
