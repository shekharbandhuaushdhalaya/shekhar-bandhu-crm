# Production hardening applied

This release includes the following production-readiness changes:

- Exact HTTPS CORS allowlisting in production. Vercel/Render wildcard trust is development-only.
- Explicit `X-Firm-Id` / JWT firm selection can no longer silently fall back to another firm.
- Refresh-token rotation is atomically consumed to prevent concurrent reuse.
- Refresh flow handles deleted users safely.
- HTTP keep-alive, header, and request timeouts are explicitly configured.
- Helmet headers are applied before static uploads.
- Upload caching is enabled only in production and dotfiles are denied.
- Access logs record request paths instead of raw URLs, avoiding query-string credential/code leakage.
- Unknown routes return a consistent JSON 404 with request ID.
- Audit-log search is regex-escaped and bounded; dates are validated; pagination is capped.
- Production seeding is rejected if users already exist, preventing accidental partial/demo reseeding.
- Container healthcheck targets `/api/ready`.
- GitHub Actions release gates run backend install/lint/tests and frontend TypeScript/web export checks.

## Validation performed in this workspace

- Node syntax check passed for all 289 server JavaScript files.
- Production configuration checks passed for exact-origin enforcement and short-JWT rejection.
- Full dependency-backed lint/Jest/frontend builds could not be run in this workspace because the uploaded project does not contain its dependency tree and package installation was unavailable/time-limited. CI is configured to run those gates with `npm ci`.
