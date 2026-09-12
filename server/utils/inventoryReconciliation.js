const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const Challan = require('../models/Challan');

/**
 * Compares stored warehouse stock with the append-only stock ledger.
 * This is intentionally read-only: reconciliation never mutates production data.
 */
async function reconcileInventory({ warehouseId, productId, limit = 500 } = {}) {
  const entryFilter = {};
  const ledgerFilter = {};
  if (warehouseId) { entryFilter.warehouseId = warehouseId; ledgerFilter.warehouseId = warehouseId; }
  if (productId) { entryFilter.productId = productId; ledgerFilter.productId = productId; }

  const entries = await InventoryEntry.find(entryFilter).lean();
  const ledgers = await StockLedger.find(ledgerFilter).sort({ createdAt: 1, _id: 1 }).limit(limit * 20).lean();
  const bySlot = new Map();
  for (const e of entries) {
    const key = [e.warehouseId, e.productId, e.vendorId || '', e.packing || 1, e.batchNo || ''].join('|');
    bySlot.set(key, Number(e.qtyBoxes || 0));
  }
  const calculated = new Map();
  for (const l of ledgers) {
    const key = [l.warehouseId, l.productId, l.vendorId || '', l.packing || 1, l.batchNo || ''].join('|');
    calculated.set(key, (calculated.get(key) || 0) + Number(l.qtyBoxes || 0));
  }

  const discrepancies = [];
  const keys = new Set([...bySlot.keys(), ...calculated.keys()]);
  for (const key of keys) {
    const stored = Number(bySlot.get(key) || 0);
    const ledger = Number(calculated.get(key) || 0);
    if (Math.abs(stored - ledger) > 0.0001) {
      const [w, p, vendorId, packing, batchNo] = key.split('|');
      discrepancies.push({ warehouseId: w, productId: p, vendorId, packing: Number(packing), batchNo, storedQty: stored, ledgerQty: ledger, difference: Number((stored - ledger).toFixed(4)) });
      if (discrepancies.length >= limit) break;
    }
  }

  const finalized = await Challan.find({ status: 'finalized', ...(warehouseId ? { warehouseId } : {}) }).select('challanNo inventoryPostedAt').limit(Math.min(limit, 1000)).lean();
  const refs = new Set((await StockLedger.find({ ...ledgerFilter, reference: { $in: finalized.map(c => c.challanNo) } }).select('reference').lean()).map(x => x.reference));
  const orphanPostedChallans = finalized.filter(c => !refs.has(c.challanNo));

  return { ok: discrepancies.length === 0 && orphanPostedChallans.length === 0, discrepancies, orphanPostedChallans, checkedInventorySlots: keys.size, checkedLedgerRows: ledgers.length };
}

module.exports = { reconcileInventory };
