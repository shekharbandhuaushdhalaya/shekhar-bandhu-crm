const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');

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
 * Resolves a warehouse by ID, fallback to default or first warehouse.
 */
async function resolveWarehouse(warehouseId) {
  if (warehouseId) {
    const wh = await Warehouse.findById(warehouseId);
    if (wh) return wh;
  }
  let defaultWh = await Warehouse.findOne({ isDefault: true });
  if (!defaultWh) {
    defaultWh = await Warehouse.findOne();
  }
  return defaultWh;
}

/**
 * Deducts inventory for a sale invoice (direct sale/sampling/damage).
 */
async function deductInventoryForInvoice(invoice) {
  if (!invoice.items || invoice.items.length === 0) return;

  const warehouse = await resolveWarehouse(invoice.warehouseId);
  if (!warehouse) return;

  for (const item of invoice.items) {
    let product;
    if (item.productId) {
      product = await Product.findById(item.productId);
    }
    if (!product && item.name) {
      product = await Product.findOne({ name: item.name });
    }
    if (!product) continue;

    const boxesToDeduct = item.qty || item.boxes || 0;
    const packing = item.packing || 1;

    // 1. Decrement product stock level
    product.stockLevel = Math.max(0, product.stockLevel - boxesToDeduct);
    await product.save();

    // 2. Decrement specific InventoryEntry
    const entryQuery = {
      warehouseId: warehouse._id,
      productId: product._id,
      packing
    };
    if (item.batchNo) entryQuery.batchNo = item.batchNo;

    let entry = await InventoryEntry.findOne(entryQuery);
    if (entry) {
      entry.qtyBoxes = Math.max(0, entry.qtyBoxes - boxesToDeduct);
      await entry.save();
    }

    // 3. Record Stock Ledger movement (OUT)
    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'OUT',
      qtyBoxes: -boxesToDeduct,
      balanceBoxes: entry ? entry.qtyBoxes : 0,
      reference: invoice.invoiceNo,
      note: `Sales Invoice ${invoice.invoiceNo} (Finalized)`,
      createdBy: 'System',
      packing,
      batchNo: item.batchNo || ''
    });
  }
}

module.exports = {
  calculateInvoiceTotals,
  resolveWarehouse,
  deductInventoryForInvoice
};
