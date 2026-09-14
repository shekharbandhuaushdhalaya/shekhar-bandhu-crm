# Production Runbook

## Before first production start
1. Provision MongoDB with replica-set/Atlas transactions enabled.
2. Set all required environment variables from `server/.env.example`.
3. Take a verified `mongodump` backup and keep a copy outside the application host.
4. Run `MIGRATION_CONFIRM=YES node server/scripts/migrate-production.js` once against the production database; do not enable startup migrations.
5. Deploy the API and verify `/api/health` and `/api/ready`.
6. Confirm every business collection has `firmId` and every user has an active `UserFirm` membership.
7. Verify unique indexes were converted to firm-scoped indexes and run a restore test.
8. Configure HTTPS, restrictive `ALLOWED_ORIGINS`, backups and restore testing.

## Release gates
- `npm ci`, lint, unit/integration tests and frontend TypeScript build pass.
- No mock/demo data on production screens.
- Webhooks use provider signature verification and event idempotency.
- Accounting/GST mutations are transaction-safe and auditable.
- Backup restore test completed.
- Monitor 5xx rate, DB health, worker dead jobs and external integration failures.
- CI must pass backend lint/tests and frontend TypeScript/web export gates before release.
- Production CORS is exact HTTPS-origin only; deployment-provider subdomains are not implicitly trusted.
- Run `npm run preflight:production` with the production environment before deploying.
- Run `npm run verify:indexes` against staging and production after migrations; investigate every missing or duplicate index before opening traffic.
- Run `GET /api/inventory/reconciliation` with an inventory-authorized account after each stock migration and after any incident. This report is read-only and must be archived with the release record.
- High-risk mutation clients must send a stable `Idempotency-Key` (stock receipts/adjustments, posted-Challan invoice conversion, payments, returns, GRNs, and dispatches).

## Operational rules
- Never run destructive reset endpoints in production.
- Use cancellation/reversal for financial documents instead of hard deletion.
- Every production incident should include the `X-Request-ID` from the response/logs.
- Rotate JWT/integration secrets through the deployment secret manager.


## Integration secrets
Production secrets are environment/secret-manager first: `JWT_SECRET`, MongoDB URI, Razorpay secrets, Gemini, Resend, Twilio, Meta and courier webhook secret. Do not commit them or store them in application documents.

## Tenant model
Business models are tenant-scoped through `firmId`. The server derives the active firm from an authenticated `UserFirm` membership and rejects cross-firm access. Use `X-Firm-Id` only to select a firm the user already belongs to; never trust a client-supplied firm ID by itself.

## Disaster recovery
- Create backups with `BACKUP_CONFIRM=YES npm run backup:database` from a host with MongoDB Database Tools installed.
- Store backups in independent storage; do not rely on the application container filesystem.
- Test restores regularly using `RESTORE_CONFIRM=YES npm run restore:database -- /path/to/archive.gz` against a staging database first.
- The HTTP `/api/system/backup` and `/api/system/restore` endpoints intentionally do not perform database backup/restore operations.

## Stock integrity response

The reconciliation endpoint compares InventoryEntry slots with the append-only
StockLedger and flags finalized Challans that have no corresponding ledger
reference. It never repairs records automatically. Any variance requires a
documented stocktake/approval and an auditable adjustment using the normal
inventory workflow.

## Production startup safety
- Do not set `RUN_STARTUP_MIGRATIONS=true` in production.
- Do not set `ALLOW_PRODUCTION_SEED=true` during normal deployment.
- Production seeding, if ever required for an empty environment, requires explicit `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (12+ chars), `ALLOW_PRODUCTION_SEED=true`, and a controlled release procedure.
- `ALLOWED_ORIGINS` must contain exact frontend origins; wildcard Vercel/Render origins are not accepted in production.
- WebSocket authentication accepts the token through the Socket.IO auth payload, not the query string, to avoid token leakage through URLs/logs.
