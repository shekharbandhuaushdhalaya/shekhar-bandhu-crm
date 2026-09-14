# API error contract

Mutation failures return JSON with an `error` message, a stable `code` when the
caller can act on it, and `requestId` from the server middleware. Clients should
show the message to the operator only after preserving the code for support logs.

| Code | Meaning | Operator action |
| --- | --- | --- |
| `IDEMPOTENCY_KEY_REQUIRED` | A production stock, money, return, GRN, or dispatch mutation omitted its retry key. | Retry with a stable `Idempotency-Key` header. |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS` | The same key is already being processed. | Poll/retry the same key after the first request completes. |
| `IDEMPOTENCY_KEY_CONFLICT` | A key was reused with a different request body/path. | Generate a new key; do not silently replay. |
| `CHALLAN_REQUIRED` / `CHALLAN_NOT_POSTED` | A financial or logistics step was attempted before a posted Sale Challan. | Complete the Sales Order → Sale Challan flow first. |
| `INVENTORY_RECONCILIATION_FAILED` | The read-only stock integrity report could not be generated. | Use the request ID and check database readiness. |
| `INVENTORY_ENTRY_NOT_FOUND` / `INSUFFICIENT_STOCK` | A stock slot is missing or does not contain enough quantity. | Refresh inventory and investigate a reconciliation variance. |
| `PAYMENT_CREATE_FAILED` / `PAYMENT_REVERSAL_FAILED` | Atomic payment posting/reversal failed. | Do not retry with a new key until the original result is known. |
| `RATING_ALREADY_SUBMITTED` | The same public client already rated a product today. | Ask the customer to try again tomorrow or sign in. |

All production integrations fail closed when provider credentials are absent;
the API never returns a successful “simulated” delivery in production.
