const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const Challan = require('../models/Challan');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RawMaterialLedger = require('../models/RawMaterialLedger');

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
  const ledgerSlotTotals = await StockLedger.aggregate([
    { $match: ledgerFilter },
    { $group: { _id: { warehouseId: '$warehouseId', productId: '$productId', vendorId: { $ifNull: ['$vendorId', ''] }, packing: { $ifNull: ['$packing', 1] }, batchNo: { $ifNull: ['$batchNo', ''] } }, qty: { $sum: '$qtyBoxes' } } }
  ]);
  const checkedLedgerRows = await StockLedger.countDocuments(ledgerFilter);
  const bySlot = new Map();
  for (const e of entries) {
    const key = [e.warehouseId, e.productId, e.vendorId || '', e.packing || 1, e.batchNo || ''].join('|');
    bySlot.set(key, Number(e.qtyBoxes || 0));
  }
  const calculated = new Map();
  for (const l of ledgerSlotTotals) {
    const key = [l._id.warehouseId, l._id.productId, l._id.vendorId || '', l._id.packing || 1, l._id.batchNo || ''].join('|');
    calculated.set(key, Number(l.qty || 0));
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

  const rawEntryFilter = {};
  const rawLedgerFilter = {};
  if (warehouseId) { rawEntryFilter.warehouseId = warehouseId; rawLedgerFilter.warehouseId = warehouseId; }
  const rawEntries = await RawMaterialEntry.find(rawEntryFilter).select('rawMaterialId warehouseId batchNo qty').lean();
  const rawLedgerTotals = await RawMaterialLedger.aggregate([
    { $match: rawLedgerFilter },
    { $group: { _id: { rawMaterialId: '$rawMaterialId', warehouseId: '$warehouseId', batchNo: { $ifNull: ['$batchNo', ''] } }, qty: { $sum: '$qty' } } }
  ]);
  const rawStored = new Map(rawEntries.map(e => [[e.rawMaterialId, e.warehouseId, e.batchNo || ''].join('|'), Number(e.qty || 0)]));
  const rawDiscrepancies = [];
  for (const row of rawLedgerTotals) {
    const key = [row._id.rawMaterialId, row._id.warehouseId, row._id.batchNo || ''].join('|');
    const stored = Number(rawStored.get(key) || 0);
    const ledger = Number(row.qty || 0);
    if (Math.abs(stored - ledger) > 0.0001) rawDiscrepancies.push({ rawMaterialId: row._id.rawMaterialId, warehouseId: row._id.warehouseId, batchNo: row._id.batchNo || '', storedQty: stored, ledgerQty: ledger, difference: Number((stored - ledger).toFixed(4)) });
  }

  return { ok: discrepancies.length === 0 && orphanPostedChallans.length === 0 && rawDiscrepancies.length === 0, discrepancies, rawMaterialDiscrepancies: rawDiscrepancies.slice(0, limit), orphanPostedChallans, checkedInventorySlots: keys.size, checkedLedgerRows, checkedRawMaterialLedgerRows: rawLedgerTotals.length };
}

module.exports = { reconcileInventory };
