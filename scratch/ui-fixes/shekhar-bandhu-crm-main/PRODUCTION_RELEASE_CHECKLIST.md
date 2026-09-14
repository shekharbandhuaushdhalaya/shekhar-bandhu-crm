# Production release checklist

## Automated gates
- Backend: `npm ci`, `npm run lint`, `npm test -- --runInBand`.
- Frontend: `npm ci`, `npx tsc --noEmit`, `npx expo export --platform web`.
- Render API health: `/api/health` and readiness: `/api/ready`.

## Security
- Use a long random `JWT_SECRET`; never commit it.
- `ALLOWED_ORIGINS` must contain exact HTTPS frontend origins in production.
- Keep `ENFORCE_TENANCY=true`.
- Verify every production user has an active firm membership.
- Never enable startup migrations or demo seeding in normal production deploys.
- Review webhook signatures and idempotency for every external integration.

## Data integrity
- Confirm firm-scoped indexes are present after migrations.
- Financial documents must be cancelled/reversed rather than hard-deleted.
- Verify audit records for permission, inventory, purchasing and financial changes.
- Take a backup before migrations and test restoring it to staging.

## Operations
- Configure external uptime monitoring for `/api/ready`.
- Monitor HTTP 5xx, authentication failures, MongoDB connectivity, queue failures and external integrations.
- Keep backups outside the application container filesystem.
- Use `X-Request-ID` when investigating incidents.
- Maintain a staging environment for release validation.

## UX acceptance
- Every important mutation has loading, success and error feedback.
- Destructive actions require confirmation.
- Forms warn about unsaved changes where appropriate.
- Lists use pagination/search rather than loading unbounded datasets.
- Mobile drawer, keyboard handling and narrow screens are tested.

## Mandatory automated production gate

The repository includes `.github/workflows/production-gate.yml`. A production release must not be deployed unless both CI jobs pass on the exact commit/tag being released.

- Backend: `npm ci` → `npm run lint` → `npm run test:ci` → production dependency audit.
- CRM frontend: `npm ci` → `npm run typecheck` → `npm run build` → production dependency audit.
- Production CORS is exact-match only. Every browser origin must be explicitly listed in `ALLOWED_ORIGINS`.
- `PUBLIC_FIRM_ID` is mandatory in production and must be a valid MongoDB ObjectId. Public storefront routes never guess a tenant in production.
