# Website Customer Self-Service Integration

The Shekhar Bandhu website is integrated with the CRM customer portal API.

## Production environment

CRM / Render:
- `PUBLIC_FIRM_ID=<Mongo ObjectId of the firm represented by the website>`
- `ALLOWED_ORIGINS=https://<website-domain>` (include any other exact trusted origins as documented by the CRM)
- existing production `JWT_SECRET` and MongoDB settings remain required

Website:
- `NEXT_PUBLIC_API_BASE_URL=https://<crm-api-domain>` (no `/api` suffix)

## Customer access

Portal access is enabled from the CRM using `PUT /api/customers/:id/portal-access` with an email and password. Passwords are bcrypt-hashed and are never returned by the API.

## Website workflow

1. Existing trade customer signs in at `/account/login`.
2. `/shop` loads `/api/portal/catalog`, so the displayed rate is customer-specific.
3. Checkout posts product IDs and quantities to `/api/portal/orders`.
4. The backend recalculates pricing/schemes server-side and creates a Sales Order.
5. No website action moves physical stock.
6. Inventory moves only when the business finalizes the Sale Challan.
7. `/account/orders` supports order history and repeat orders.
8. `/track` supports logged-in portal customers as well as the existing OTP guest tracking flow.
9. `/account/invoices` displays invoices and receivables ageing.

## Security rules

- Portal JWTs are scoped to `customer-portal` and the tenant firm.
- Catalog/account/order/invoice routes derive the customer from the token.
- Client-submitted prices are ignored for authenticated portal orders.
- Website orders use retry-safe `clientOrderRef` idempotency.
- The website never receives password hashes.
