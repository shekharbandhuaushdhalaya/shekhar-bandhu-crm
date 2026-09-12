# Challan-Centric Inventory Architecture

## Source of truth
For every sale-side physical dispatch and internal transfer of goods, the Challan is the authoritative physical-goods document. A normal sale invoice, payment, quotation or sales order must not independently reduce physical stock.

## Production flow
Production completion receives finished goods into the manufacturing-unit warehouse and atomically creates a draft `production_transfer` Challan. The user-selected destination is stored on that Challan. Physical movement from production house to destination occurs only when that Challan is finalized.

## Atomic posting
Challan finalization performs source deduction, destination addition (for transfers), stock-ledger writes and Challan posting inside one MongoDB transaction. Internal transfers are aggregate-stock neutral; sale dispatches reduce the legacy firm-wide Product.stockLevel.

## Reversal
Posted Challans are immutable. Use `POST /api/challans/:id/reverse` to create compensating stock movements and mark the original Challan reversed.

## Reconciliation
`GET /api/inventory/reconciliation` compares warehouse inventory slots with the append-only StockLedger. It is read-only and never silently repairs discrepancies.

## Idempotency
Finalization/reversal support the `Idempotency-Key` header. Processing keys are tenant-scoped and stale processing keys older than ten minutes can be recovered.
