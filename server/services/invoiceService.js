const Warehouse = require('../models/Warehouse');

/**
 * Calculates item totals, base total, GST tax (CGST/SGST vs IGST), and rounded nett amount for an invoice.
 */
function calculateInvoiceTotals(items = [], isIntraState = true) {
  let totalBase = 0;
  let totalTax = 0;

  const processedItems = items.map(it => {
    const qty = Number(it.qty || it.boxes || 0);
    const rate = Number(it.rate || 0);
    const packing = Number(it.packing || 1);
    const itemBase = qty * rate * packing;

    totalBase += itemBase;
    const gstRate = Number(it.gstRate || 0);
    const itemTax = (itemBase * gstRate) / 100;
    totalTax += itemTax;

    return {
      ...it,
      qty,
      boxes: qty,
      packing,
      rate,
      gstRate,
      amount: Number((itemBase + itemTax).toFixed(2))
    };
  });

  const cgst = isIntraState ? Number((totalTax / 2).toFixed(2)) : 0;
  const sgst = isIntraState ? Number((totalTax / 2).toFixed(2)) : 0;
  const igst = !isIntraState ? Number(totalTax.toFixed(2)) : 0;

  const rawTotal = totalBase + cgst + sgst + igst;
  const nettTotal = Math.round(rawTotal);
  const roundOff = Number((nettTotal - rawTotal).toFixed(2));

  return {
    items: processedItems,
    baseAmount: Number(totalBase.toFixed(2)),
    cgst,
    sgst,
    igst,
    roundOff,
    nettTotal
  };
}

/**
 * Calculates TDS (Section 194Q - 0.1%) or TCS (Section 206C(1H) - 0.1%) for transactions over ₹50L.
 */
function calculateTdsTcs(type = 'sale', baseAmount = 0, partyCumulativeAnnualTurnover = 0) {
  let tdsAmount = 0;
  let tcsAmount = 0;
  const threshold = 5000000;

  if (partyCumulativeAnnualTurnover > threshold) {
    if (type === 'purchase') {
      tdsAmount = Number((baseAmount * 0.001).toFixed(2));
    } else if (type === 'sale') {
      tcsAmount = Number((baseAmount * 0.001).toFixed(2));
    }
  }

  return { tdsAmount, tcsAmount };
}

/**
 * Resolves a physical Warehouse. Historical callers sometimes passed a
 * ManufacturingUnit id in the warehouse field; support that only by mapping it
 * to the warehouse linked through `manufacturingUnitId`—never by returning a
 * ManufacturingUnit document as if it were inventory storage.
 */
async function resolveWarehouse(warehouseId) {
  if (warehouseId) {
    let warehouse = await Warehouse.findById(warehouseId);
    if (warehouse) return warehouse;
    warehouse = await Warehouse.findOne({ manufacturingUnitId: warehouseId });
    if (warehouse) return warehouse;
    return null;
  }

  const defaults = await Warehouse.find({ isDefault: true }).limit(2);
  if (defaults.length === 1) return defaults[0];
  const warehouses = await Warehouse.find({}).sort({ createdAt: 1 }).limit(2);
  return warehouses.length === 1 ? warehouses[0] : null;
}

module.exports = {
  calculateInvoiceTotals,
  calculateTdsTcs,
  resolveWarehouse
};
