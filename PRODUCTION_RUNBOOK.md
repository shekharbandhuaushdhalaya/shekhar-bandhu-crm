# Production Runbook

## Before first production start
1. Provision MongoDB with replica-set/Atlas transactions enabled.
2. Set all required environment variables from `server/.env.example`.
3. Deploy the API and verify `/api/health` and `/api/ready`.
4. Run `node server/scripts/migrate-production.js` once against the production database.
5. Confirm every business collection has `firmId` and every user has an active `UserFirm` membership.
6. Verify unique indexes were converted to firm-scoped indexes and run a restore test.
7. Configure HTTPS, restrictive `ALLOWED_ORIGINS`, backups and restore testing.

## Release gates
- `npm ci`, lint, unit/integration tests and frontend TypeScript build pass.
- No mock/demo data on production screens.
- Webhooks use provider signature verification and event idempotency.
- Accounting/GST mutations are transaction-safe and auditable.
- Backup restore test completed.
- Monitor 5xx rate, DB health, worker dead jobs and external integration failures.

## Operational rules
- Never run destructive reset endpoints in production.
- Use cancellation/reversal for financial documents instead of hard deletion.
- Every production incident should include the `X-Request-ID` from the response/logs.
- Rotate JWT/integration secrets through the deployment secret manager.


## Integration secrets
Production secrets are environment/secret-manager first: `JWT_SECRET`, MongoDB URI, Razorpay secrets, Gemini, Resend, Twilio, Meta and courier webhook secret. Do not commit them or store them in application documents.

## Tenant model
Business models are tenant-scoped through `firmId`. The server derives the active firm from an authenticated `UserFirm` membership and rejects cross-firm access. Use `X-Firm-Id` only to select a firm the user already belongs to; never trust a client-supplied firm ID by itself.
